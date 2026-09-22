import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { db, FieldValue, CALLABLE_OPTS, GEMINI_API_KEY } from '../shared/admin';
import { requireOwner } from '../shared/guards';

/**
 * T5-5 · 섹션 AI 챗봇 (Gemini).
 * 시스템 프롬프트로 "등록된 [자료] 안에서만" 답하도록 제한하고,
 * 자료에 없으면 담당 MD 연결을 권한다. 1인 1일 50회.
 */
const AI_DAILY_LIMIT = 50;
const MAX_CONTEXT_CHARS = 24_000; // 대략 8k 토큰

const SYSTEM_PROMPT = `너는 "GS25 상품전략공유회" 안내 도우미다.
아래 [자료] 안에서만 한국어로 짧고 쉽게 답하라.
규칙:
- 자료에 없거나 불확실하면 추측하지 말고 "담당 MD에게 질문하기"를 권하라.
- 타사(CU, 세븐일레븐, 이마트24 등) 비교를 하지 마라.
- 개인정보를 묻거나 답하지 마라.
- 매출·수익을 단정하는 표현을 쓰지 마라.
- 50~60대 경영주가 읽는다고 생각하고 문장을 짧게, 존댓말로 쓴다.
- 답변은 5문장 이내로 한다.`;

const schema = z.object({
  sectionId: z.string().min(1).max(64),
  productId: z.string().max(64).optional(),
  message: z.string().trim().min(1).max(300),
  history: z
    .array(z.object({ role: z.enum(['user', 'bot']), text: z.string().max(1000) }))
    .max(10)
    .optional(),
});

const FORBIDDEN = ['개인정보', '주민번호', '전화번호', 'cu ', '세븐일레븐', '이마트24'];

export const askSectionBot = onCall(
  { ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (req) => {
    const caller = requireOwner(req);
    const parsed = schema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '질문을 확인해 주세요.');
    const { sectionId, productId, message, history } = parsed.data;

    // 1인 1일 50회
    const dayKey = `${caller.uid}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const usageRef = db.collection('aiUsage').doc(dayKey);
    const used = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = (snap.data()?.count as number) ?? 0;
      if (count >= AI_DAILY_LIMIT) return count;
      tx.set(usageRef, { count: FieldValue.increment(1), uid: caller.uid }, { merge: true });
      return count;
    });
    if (used >= AI_DAILY_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        `하루 질문 한도(${AI_DAILY_LIMIT}회)를 모두 사용하셨습니다.`,
      );
    }

    // 금칙 처리
    const low = message.toLowerCase();
    if (FORBIDDEN.some((f) => low.includes(f.trim()))) {
      return {
        text: '타사 비교나 개인정보에 대해서는 답변드릴 수 없습니다. 상품·운영 관련 질문을 해주시면 등록된 자료 범위 안에서 안내해 드리겠습니다.',
        grounded: false,
        remaining: AI_DAILY_LIMIT - used - 1,
      };
    }

    // 섹션 자료 합본 (products.aiContext)
    const prodSnap = await db.collection('products').where('sectionId', '==', sectionId).get();
    let context = '';
    for (const d of prodSnap.docs) {
      const p = d.data();
      const chunk = `## ${p.name}\n분류: ${p.category}\n핵심: ${(p.summary3 ?? []).join(' / ')}\n${p.aiContext ?? ''}\n\n`;
      if (context.length + chunk.length > MAX_CONTEXT_CHARS) break;
      context += chunk;
    }
    if (!context) {
      return {
        text: '이 섹션에는 아직 등록된 자료가 없습니다. [MD에게 질문하기]로 담당 MD에게 직접 여쭤보시면 문자로 답변을 받으실 수 있습니다.',
        grounded: false,
        remaining: AI_DAILY_LIMIT - used - 1,
      };
    }

    const focus = productId ? `\n\n지금 사용자가 보고 있는 상품 id: ${productId}` : '';
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `${SYSTEM_PROMPT}\n\n[자료]\n${context}${focus}`,
    });

    const chat = model.startChat({
      history: (history ?? []).map((h) => ({
        role: h.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: h.text }],
      })),
      generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
    });

    let text: string;
    try {
      const res = await chat.sendMessage(message);
      text = res.response.text().trim();
    } catch {
      throw new HttpsError('unavailable', '지금은 답변을 드리기 어렵습니다. 잠시 후 다시 시도해 주세요.');
    }

    const grounded = !/담당 MD에게 질문/.test(text);

    // 대화 로그 저장 → 관리자가 FAQ 로 반영 (F-06)
    const turns = db.collection('chatLogs').doc(caller.uid).collection('turns');
    await turns.add({ sectionId, role: 'user', text: message, createdAt: FieldValue.serverTimestamp() });
    await turns.add({
      sectionId,
      role: 'bot',
      text,
      createdAt: FieldValue.serverTimestamp(),
      tokensUsed: Math.ceil((context.length + text.length) / 4),
    });

    return { text, grounded, remaining: AI_DAILY_LIMIT - used - 1 };
  },
);

/** 섹션별 추천 질문 칩 3개 */
export const getSuggestedQuestions = onCall(CALLABLE_OPTS, async (req) => {
  requireOwner(req);
  const parsed = z.object({ sectionId: z.string() }).safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');

  const snap = await db
    .collection('products')
    .where('sectionId', '==', parsed.data.sectionId)
    .orderBy('order')
    .limit(3)
    .get();

  return { chips: snap.docs.map((d) => `${d.data().name}은(는) 무엇이 달라지나요?`) };
});
