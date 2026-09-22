/**
 * 🔒 퀴즈 정답 — 서버 전용.
 * 클라이언트 번들에 절대 포함시키지 않는다(PRD S-05, PROMPT 절대 규칙).
 * 실제 운영에서는 Firestore `quizAnswers/{productId}` (클라이언트 read/write false)에 저장되고,
 * 여기 값은 로컬·에뮬레이터 시드용 원본이다.
 */
if (typeof window !== 'undefined') {
  throw new Error('quizAnswers must never be imported on the client');
}

export interface QuizAnswer {
  answerIndex: number;
  explanation: string;
}

export const QUIZ_ANSWERS: Record<string, QuizAnswer> = {
  'ps-layout': {
    answerIndex: 1,
    explanation: '주통로는 1.2m, 보조통로는 0.9m가 기준입니다. 장바구니 두 대가 교차할 수 있는 폭입니다.',
  },
  'ps-gondola': {
    answerIndex: 2,
    explanation: '성인 눈높이인 3~4단이 골든존입니다. 이 구역에 회전율 상위 20% 상품을 진열합니다.',
  },
  'ps-walkin': {
    answerIndex: 1,
    explanation: '후면에서 밀어 넣으면 앞 상품이 먼저 나가 선입선출이 자동으로 지켜집니다.',
  },
  'ps-endcap': {
    answerIndex: 1,
    explanation: '여러 행사를 섞으면 주목도가 떨어집니다. 한 매대 = 한 메시지가 원칙입니다.',
  },
  'ps-pb': {
    answerIndex: 1,
    explanation: '프리미엄 라인은 한정 수량으로 운영해 희소성을 유지합니다.',
  },
  'ps-signage': {
    answerIndex: 0,
    explanation: 'ESL 도입으로 손으로 가격표를 바꾸는 작업이 사라져 점포당 주 평균 2시간이 절감됩니다.',
  },
  'pc-hotbar': {
    answerIndex: 2,
    explanation: '피크타임 대기를 줄이기 위해 조리 90초 이하 품목으로 라인업을 재편했습니다.',
  },
  'pc-coffee': {
    answerIndex: 1,
    explanation: '세척 완료를 체크해야 다음 주문이 가능합니다. 위생 관리가 강제되는 구조입니다.',
  },
  'pc-bunsik': {
    answerIndex: 1,
    explanation: '0.6㎡ 소형 집기 한 대로 떡볶이와 어묵을 함께 운영합니다.',
  },
  'pc-package': {
    answerIndex: 1,
    explanation: '전환 기간 중 늘어나는 포장재 단가 차액은 본부가 부담합니다.',
  },
  'pc-app-order': {
    answerIndex: 1,
    explanation: '노쇼 주문은 자동 취소되고 결제도 자동 환불되어 점포 손실이 없습니다.',
  },
  'pf-veg': {
    answerIndex: 1,
    explanation: '주 3회 입고, 입고 후 2일(D+2)까지가 판매 기한입니다.',
  },
  'pf-meal': {
    answerIndex: 2,
    explanation: '퇴근 시간대인 18~21시가 밀키트의 주력 시간대입니다.',
  },
  'pf-fruit': {
    answerIndex: 1,
    explanation: '3,000원대 단일 가격으로 고객이 고민 없이 집을 수 있게 했습니다.',
  },
  'pf-cold': {
    answerIndex: 1,
    explanation: '기준 온도를 벗어난 구간이 있으면 자동 반품 처리되어 경영주 확인 부담이 없습니다.',
  },
  'pf-local': {
    answerIndex: 1,
    explanation: '생산 권역 내 점포에 우선 공급하고, 산지·생산자 POP를 함께 제공합니다.',
  },
  'pn-office': {
    answerIndex: 2,
    explanation: '취식 공간 최소 4석을 확보하면 체류 시간이 늘고 음료 추가 구매가 발생합니다.',
  },
  'pn-resi': {
    answerIndex: 2,
    explanation: '주거 상권은 저녁부터 심야까지가 핵심 시간대입니다.',
  },
  'pn-tour': {
    answerIndex: 2,
    explanation: '영어·일본어·중국어 결제 안내를 기본 제공합니다.',
  },
  'pe-onboard': {
    answerIndex: 1,
    explanation: '1일차 안전·위생, 2일차 포스·상품, 3일차 발주·청소로 이어지는 3일 과정입니다.',
  },
  'pe-online': {
    answerIndex: 0,
    explanation: '근무 중 쉬는 시간에도 볼 수 있도록 5분 내외로 구성했습니다.',
  },
  'pe-safety': {
    answerIndex: 1,
    explanation: '월 1회 앱으로 제출하며 주요 항목은 사진 첨부가 필수입니다.',
  },
  'pa-auto': {
    answerIndex: 2,
    explanation: 'AI는 제안만 하고 최종 확정은 경영주님이 합니다. 수정 이력은 다시 학습에 반영됩니다.',
  },
  'pa-forecast': {
    answerIndex: 1,
    explanation: '전사 결품률 목표는 3% 이하입니다.',
  },
  'pa-app': {
    answerIndex: 3,
    explanation: '발주·정산·교육·공지를 통합했습니다. 고객 배달 주문 접수는 별도 채널입니다.',
  },
  'pv-council': {
    answerIndex: 1,
    explanation: '분기 1회 정기 개최하며 안건은 2주 전에 공개됩니다.',
  },
  'pv-support': {
    answerIndex: 0,
    explanation: '신규 개점 초기와 매출 부진 구간에 지원이 집중됩니다.',
  },
  'pv-welfare': {
    answerIndex: 0,
    explanation: '대체 근무 인력 매칭을 일부 권역에서 시범 운영합니다.',
  },
  'pg-teaser': {
    answerIndex: 2,
    explanation: '스탬프 3·6·9개를 모을 때마다 기념품 힌트가 하나씩 열립니다.',
  },
};
