/**
 * T5-6 / T5-7 · 간이 한국어 토큰 추출 + 금칙어 필터.
 * (웹앱의 lib/server/tokenize.ts 와 동일한 규칙 — 집계 결과가 달라지지 않도록 함께 관리한다.)
 */
const JOSA = [
  '으로서', '으로써', '에서는', '에게서', '이라고', '라고는',
  '에서', '에게', '한테', '으로', '까지', '부터', '보다', '처럼', '마다', '조차', '밖에',
  '이라', '라는', '이는', '은', '는', '이', '가', '을', '를', '과', '와', '도', '만', '의', '에', '로', '랑',
];

const ENDINGS = [
  '했습니다', '합니다', '됩니다', '입니다', '하네요', '해요', '이에요', '예요', '네요', '어요', '아요',
  '했어요', '드립니다', '드려요', '바랍니다', '같아요', '같습니다', '겠습니다', '세요', '시길', '하자',
];

const STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '정말', '진짜', '너무', '매우', '아주', '조금', '이번', '저번', '오늘',
  '내일', '어제', '우리', '저희', '여기', '거기', '저기', '그것', '이것', '저것', '때문', '경우', '정도',
  '대한', '위해', '통해', '관련', '모두', '다들', '많이', '항상', '역시', '그냥', '좀더', '입니다',
  '있습니다', '없습니다', '것을', '것이', '수가', '수도', '있는', '없는', '하는', '되는', '같은',
]);

export const OPTIONAL_STOPWORDS = ['화이팅', '파이팅', '감사', '감사합니다', '응원'];

export function tokenize(text: string, excludeCheerWords = false): string[] {
  const cleaned = text.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const out: string[] = [];
  for (const raw of cleaned.split(' ')) {
    let w = raw;
    for (const e of ENDINGS) {
      if (w.length > e.length && w.endsWith(e)) {
        w = w.slice(0, -e.length);
        break;
      }
    }
    for (const j of JOSA) {
      if (w.length > j.length + 1 && w.endsWith(j)) {
        w = w.slice(0, -j.length);
        break;
      }
    }
    w = w.trim();
    if (w.length < 2) continue;
    if (STOPWORDS.has(w)) continue;
    if (excludeCheerWords && OPTIONAL_STOPWORDS.includes(w)) continue;
    if (/^\d+$/.test(w)) continue;
    out.push(w);
  }
  return out;
}

const BANNED = ['시발', '씨발', '개새', '병신', '좆', '섹스', '도박', '대출', 'http://', 'https://', 'www.'];

export function containsBanned(text: string): string | null {
  const flat = text.replace(/\s/g, '').toLowerCase();
  for (const b of BANNED) {
    if (flat.includes(b.replace(/\s/g, '').toLowerCase())) return b;
  }
  return null;
}
