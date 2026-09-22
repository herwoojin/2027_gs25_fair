import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { z } from 'zod';
import {
  db,
  FieldValue,
  CALLABLE_OPTS,
  REGION,
  SCHEDULE_OPTS,
  SOLAPI_API_KEY,
  SOLAPI_API_SECRET,
  SOLAPI_SENDER,
  PHONE_ENC_KEY,
} from '../shared/admin';
import { requireStaff } from '../shared/guards';
import { sendSms } from '../shared/solapi';
import { decryptPhone } from '../shared/crypto';
import { audit } from '../shared/audit';
import { queueRow } from '../shared/sheets';

const APP_URL = process.env.APP_URL ?? 'https://expo.gs25.example';

/**
 * T5-1 · 질문 생성 트리거.
 * sections.mdIds 로 assignedMdIds 를 채우고 담당 MD 에게 SOLAPI 문자를 보낸다.
 * (질문 문서 자체는 Rules 가 허용한 범위에서 클라이언트가 직접 생성한다.)
 */
export const onQuestionCreate = onDocumentCreated(
  {
    document: 'questions/{questionId}',
    region: REGION,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const q = snap.data() as {
      sectionId?: string;
      storeCode: string;
      region: string;
      text: string;
      channel: string;
    };

    let mdIds: string[] = [];
    let sectionTitle = '본사';
    if (q.sectionId) {
      const sec = await db.collection('sections').doc(q.sectionId).get();
      mdIds = (sec.data()?.mdIds ?? []) as string[];
      sectionTitle = (sec.data()?.title as string) ?? q.sectionId;
    } else {
      const hq = await db.collection('staff').where('sectionIds', 'array-contains', 'hq').get();
      mdIds = hq.docs.map((d) => d.id);
    }

    await snap.ref.update({ assignedMdIds: mdIds });

    const link = `${APP_URL}/admin/questions?q=${event.params.questionId}`;
    const preview = q.text.slice(0, 40);

    for (const mdId of mdIds) {
      const staff = await db.collection('staff').doc(mdId).get();
      const data = staff.data() as { phoneEnc?: string; smsEnabled?: boolean } | undefined;
      if (!data?.phoneEnc || data.smsEnabled === false) continue;
      await sendSms({
        code: 'Q_TO_MD',
        to: decryptPhone(data.phoneEnc, PHONE_ENC_KEY.value()),
        text: `[공유회질의] ${sectionTitle} ${q.region} 경영주: ${preview}… 답변: ${link}`,
        apiKey: SOLAPI_API_KEY.value(),
        apiSecret: SOLAPI_API_SECRET.value(),
        sender: SOLAPI_SENDER.value(),
      });
    }

    await queueRow('Questions', [
      new Date().toISOString(),
      q.storeCode,
      q.sectionId ?? 'hq',
      q.text,
      '',
      '',
      '',
    ]);
  },
);

/** 공감(likes 서브컬렉션) 개수를 likeCount 에 반영 — 클라이언트는 likeCount 를 쓸 수 없다. */
export const onQuestionLike = onDocumentWritten(
  { document: 'questions/{questionId}/likes/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.exists;
    const after = event.data?.after.exists;
    if (before === after) return;
    await db
      .collection('questions')
      .doc(event.params.questionId)
      .update({ likeCount: FieldValue.increment(after ? 1 : -1) });
  },
);

const answerSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().trim().min(2).max(1000),
  makePublic: z.boolean().default(false),
});

/** T5-2 · MD 답변 등록 → 경영주에게 답변 문자 */
export const answerQuestion = onCall(
  {
    ...CALLABLE_OPTS,
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
  },
  async (req) => {
    const caller = requireStaff(req);
    const parsed = answerSchema.safeParse(req.data);
    if (!parsed.success) throw new HttpsError('invalid-argument', '답변 내용을 확인해 주세요.');
    const { questionId, text, makePublic } = parsed.data;

    const ref = db.collection('questions').doc(questionId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', '질문을 찾을 수 없습니다.');
    const q = snap.data() as { sectionId?: string; storeCode: string; text: string; assignedMdIds?: string[] };

    // MD 는 담당 섹션 질문만 답변할 수 있다.
    if (caller.role === 'md') {
      const staff = await db.collection('staff').doc(caller.uid).get();
      const mine = new Set([
        ...((staff.data()?.sectionIds ?? []) as string[]),
        ...((staff.data()?.backupFor ?? []) as string[]),
      ]);
      if (q.sectionId && !mine.has(q.sectionId)) {
        throw new HttpsError('permission-denied', '담당 섹션의 질문만 답변할 수 있습니다.');
      }
    }

    const staffSnap = await db.collection('staff').doc(caller.uid).get();
    const byName = (staffSnap.data()?.name as string) ?? '본부';

    await ref.update({
      answer: { text, byUid: caller.uid, byName: `${byName} MD`, at: Date.now() },
      status: 'answered',
      ...(makePublic ? { isPublic: true } : {}),
    });

    const store = await db.collection('stores').doc(q.storeCode).get();
    const phoneEnc = store.data()?.phoneEnc as string | undefined;
    if (phoneEnc) {
      await sendSms({
        code: 'A_TO_OWNER',
        to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
        text: `[공유회] 답변이 도착했습니다: ${text.slice(0, 60)}… 전체보기 ${APP_URL}/my`,
        apiKey: SOLAPI_API_KEY.value(),
        apiSecret: SOLAPI_API_SECRET.value(),
        sender: SOLAPI_SENDER.value(),
      });
    }

    await audit({ uid: caller.uid, role: caller.role, action: 'question.answered', target: questionId });
    await queueRow('Questions', [
      new Date().toISOString(),
      q.storeCode,
      q.sectionId ?? 'hq',
      q.text,
      new Date().toISOString(),
      byName,
      text,
    ]);

    return { ok: true };
  },
);

/** 운영자 신고 처리 · 공개 전환 */
export const moderateQuestion = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireStaff(req, ['operator', 'admin']);
  const parsed = z
    .object({
      questionId: z.string(),
      action: z.enum(['hide', 'show', 'publish', 'unpublish']),
    })
    .safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');

  const ref = db.collection('questions').doc(parsed.data.questionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', '질문을 찾을 수 없습니다.');

  const patch: Record<string, unknown> = {};
  if (parsed.data.action === 'hide') patch.status = 'hidden';
  if (parsed.data.action === 'show') patch.status = snap.data()?.answer ? 'answered' : 'open';
  if (parsed.data.action === 'publish') patch.isPublic = true;
  if (parsed.data.action === 'unpublish') patch.isPublic = false;
  await ref.update(patch);

  await audit({
    uid: caller.uid,
    role: caller.role,
    action: `question.${parsed.data.action}`,
    target: parsed.data.questionId,
  });
  return { ok: true };
});

/**
 * T5-3 · 2시간 미응답 에스컬레이션.
 * 업무시간(09~18시)에만 15분마다 확인하고, 백업 MD·팀장에게 재알림한다.
 */
export const escalateQuestions = onSchedule(
  {
    ...SCHEDULE_OPTS,
    schedule: 'every 15 minutes from 09:00 to 18:00',
    secrets: [SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER, PHONE_ENC_KEY],
  },
  async () => {
    const cutoff = Date.now() - 2 * 3600_000;
    const snap = await db
      .collection('questions')
      .where('status', '==', 'open')
      .where('createdAt', '<=', cutoff)
      .limit(100)
      .get();

    for (const doc of snap.docs) {
      const q = doc.data() as { escalatedAt?: number; sectionId?: string };
      if (q.escalatedAt) continue;

      const backups = q.sectionId
        ? await db.collection('staff').where('backupFor', 'array-contains', q.sectionId).get()
        : null;

      for (const b of backups?.docs ?? []) {
        const phoneEnc = b.data().phoneEnc as string | undefined;
        if (!phoneEnc) continue;
        await sendSms({
          code: 'Q_ESCALATE',
          to: decryptPhone(phoneEnc, PHONE_ENC_KEY.value()),
          text: `[공유회 미응답] 2시간이 지난 질문이 있습니다. ${APP_URL}/admin/questions`,
          apiKey: SOLAPI_API_KEY.value(),
          apiSecret: SOLAPI_API_SECRET.value(),
          sender: SOLAPI_SENDER.value(),
        });
      }
      await doc.ref.update({ escalatedAt: Date.now() });
    }
  },
);

/** T5-6 · 응원 작성 시 토큰 추출 (워드클라우드 집계 입력) */
export const onCheerCreate = onDocumentCreated(
  { document: 'cheers/{cheerId}', region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { tokenize, containsBanned } = await import('../shared/tokenize');
    const text = (snap.data().text as string) ?? '';
    const banned = containsBanned(text);
    await snap.ref.update({
      tokens: tokenize(text),
      // 금칙어가 걸리면 운영자 검수 대기로 내린다.
      ...(banned ? { status: 'pending' } : {}),
    });
    await queueRow('Cheers', [
      new Date().toISOString(),
      (snap.data().region as string) ?? '',
      text,
      banned ? 'pending' : 'visible',
    ]);
  },
);

export const moderateCheer = onCall(CALLABLE_OPTS, async (req) => {
  const caller = requireStaff(req, ['operator', 'admin']);
  const parsed = z
    .object({ cheerId: z.string(), action: z.enum(['approve', 'hide']) })
    .safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', '잘못된 요청입니다.');

  await db
    .collection('cheers')
    .doc(parsed.data.cheerId)
    .update({ status: parsed.data.action === 'approve' ? 'visible' : 'hidden' });

  await audit({
    uid: caller.uid,
    role: caller.role,
    action: `cheer.${parsed.data.action}`,
    target: parsed.data.cheerId,
  });
  return { ok: true };
});
