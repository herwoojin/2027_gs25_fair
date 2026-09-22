/**
 * 현장 체크인 화면의 기념품 체크 목록.
 * 이름은 미공개 상태여도 운영자는 알아야 하므로 클라이언트 상수로 둔다
 * (경영주 화면에는 getSouvenirs 가 공개 시점에 맞춰 내려준다).
 */
export const SOUVENIR_CHECKLIST = [
  { id: 'sv-badge', name: '기념 뱃지' },
  { id: 'sv-keyring', name: '점포 키링' },
  { id: 'sv-kit', name: '소모품 키트' },
  { id: 'sv-pen', name: '각인 펜' },
  { id: 'sv-apparel', name: '조끼/티셔츠' },
];
