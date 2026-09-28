/**
 * 사이트맵 — 이 웹앱이 어떤 화면으로 이루어져 있는지 한 장에 담는다.
 *
 * 라우트가 route group 으로 나뉘어 있어(`(public)` · `(app)` · `(admin)`)
 * 파일 구조만 봐서는 "누가 어디까지 볼 수 있는지"가 드러나지 않는다.
 * 그 접근 경계를 여기서 명시한다.
 *
 * ⚠️ 새 페이지를 추가하면 이 목록에도 같이 넣는다. 빠지면 사이트맵이 거짓말을 한다.
 */

export type Audience = 'public' | 'owner' | 'staff';

export interface SiteNode {
  path: string;
  label: string;
  desc: string;
  /** 동적 구간이 있는 경로는 실제 링크를 걸 수 없다 */
  dynamic?: boolean;
  children?: SiteNode[];
}

export interface SiteGroup {
  audience: Audience;
  title: string;
  /** 누가 들어올 수 있는지 — 사이트맵의 핵심 정보 */
  access: string;
  nodes: SiteNode[];
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  public: '누구나',
  owner: '경영주',
  staff: '본부',
};

export const SITE_MAP: SiteGroup[] = [
  {
    audience: 'public',
    title: '공개 영역',
    access: '로그인 없이 볼 수 있습니다. 상품 정보는 담기지 않습니다.',
    nodes: [
      {
        path: '/',
        label: '랜딩',
        desc: '히어로 영상 · 9개 도시 순회 일정 · 가이드맵 · 상품전략도우미 · 멘토 경영주 · 기념품 · 사전 알림',
      },
      { path: '/login', label: '경영주 로그인', desc: '점포코드 + 휴대폰 뒷 4자리 → 문자 인증번호' },
      { path: '/staff/login', label: '본부 로그인', desc: '@gsretail.com 회사 이메일 → 메일 인증번호' },
      {
        path: '/admin-schedule',
        label: '일정 관리자',
        desc: '장소·시간·주소·세부일정 편집 (ID/비밀번호, 구글시트 연동)',
      },
      { path: '/sitemap', label: '사이트맵', desc: '지금 보고 계신 이 페이지' },
    ],
  },
  {
    audience: 'owner',
    title: '경영주 전시 영역',
    access: '화이트리스트에 등록된 점포만 — 문자 인증 후 입장합니다.',
    nodes: [
      { path: '/lobby', label: '로비', desc: '전시장 조감도 · 11개 존 진입 · 진행률' },
      {
        path: '/zone/[zoneId]',
        label: '존 상세',
        desc: '존별 상품 목록 · 퀴즈 · 스탬프 획득',
        dynamic: true,
        children: [
          {
            path: '/zone/[zoneId]/product/[pid]',
            label: '상품 상세',
            desc: '3D 진열 · 스펙 · MD 코멘트',
            dynamic: true,
          },
        ],
      },
      { path: '/live', label: '라이브', desc: '지역별 상품전략도우미 유튜브 편성표·다시보기' },
      { path: '/ask', label: '질의', desc: 'MD 에게 묻고 답변 받기' },
      { path: '/cheer', label: '응원', desc: '응원 메시지 작성 · 워드클라우드' },
      { path: '/ranking', label: '랭킹', desc: '관람 진행률 · 퀴즈 점수' },
      {
        path: '/offline',
        label: '오프라인 순회',
        desc: '9개 도시 일정 · 오시는 길',
        children: [{ path: '/offline/reserve', label: '방문 예약', desc: '날짜 선택 · 입장 QR 발급' }],
      },
      { path: '/souvenir-promo', label: '기념품', desc: '현장 수령 기념품 안내' },
      { path: '/my', label: '내 정보', desc: '입장 QR · 예약 변경 · 수료증' },
    ],
  },
  {
    audience: 'staff',
    title: '본부 관리자 영역',
    access: '본부 이메일 로그인 + 역할(admin · md · operator)에 따라 메뉴가 달라집니다.',
    nodes: [
      { path: '/admin/dashboard', label: '대시보드', desc: '참여 현황 · 동시접속 혼잡도' },
      { path: '/admin/participants', label: '참여자', desc: '경영주 참여 현황 · 내보내기' },
      { path: '/admin/questions', label: '질의 인박스', desc: 'MD 답변 · 에스컬레이션' },
      {
        path: '/admin/reservations',
        label: '예약·체크인',
        desc: '순회 방문 예약 관리',
        children: [{ path: '/admin/reservations/checkin', label: '현장 체크인', desc: 'QR 스캔 입장 처리' }],
      },
      { path: '/admin/coupons', label: '쿠폰 발송', desc: '기념품·쿠폰 문자 발송' },
      { path: '/admin/cheers', label: '응원 검수', desc: '응원 메시지 노출 승인' },
      { path: '/admin/live', label: '라이브 편성', desc: '유튜브 라이브 편성표 관리' },
      { path: '/admin/content', label: '콘텐츠', desc: '섹션·상품·퀴즈·기념품 편집 (추가/수정/삭제)' },
      { path: '/admin/whitelist', label: '화이트리스트', desc: '점포 등록·제외 · 구글시트 동기화 · 메일러 상태' },
      { path: '/admin/sms', label: '문자 발송', desc: '발송 모드 점검 · 잔액 · 테스트 발송' },
      { path: '/admin/audit', label: '감사 로그', desc: '접속·보안 기록 · 문자 이력 · 백업 큐' },
      { path: '/admin/techstack', label: '기술 스택', desc: '이 플랫폼이 쓰는 기술 인벤토리' },
    ],
  },
];

/** 외부 앱 — 이 저장소 밖에 있지만 사용자 동선에는 포함된다 */
export const EXTERNAL_NODES: { label: string; desc: string; envKey: string }[] = [
  {
    label: '온라인 전시장',
    desc: '아바타로 걸어 다니는 전시장 (별도 앱). 랜딩의 「전시 입장하기」가 새 창으로 엽니다.',
    envKey: 'NEXT_PUBLIC_EXHIBITION_URL',
  },
];

export function countPages(): number {
  const walk = (n: SiteNode[]): number =>
    n.reduce((a, x) => a + 1 + (x.children ? walk(x.children) : 0), 0);
  return SITE_MAP.reduce((a, g) => a + walk(g.nodes), 0);
}
