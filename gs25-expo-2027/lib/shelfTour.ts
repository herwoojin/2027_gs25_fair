/**
 * [한 바퀴 자동 투어] 트리거.
 *
 * ⚠️ 이 함수는 ShelfScene(three.js)과 **같은 모듈에 두면 안 된다.**
 * 버튼이 있는 페이지가 이 함수를 정적 import 하는 순간 three.js 번들이
 * 코드 스플리팅을 우회해 초기 로드에 딸려 들어온다.
 */
export const SHELF_TOUR_EVENT = 'gs-shelf-tour';

export function startShelfTour() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SHELF_TOUR_EVENT));
}
