/**
 * 카카오맵 연동 — 전부 URL 방식이다.
 *
 * JavaScript SDK 를 쓰지 않는다. SDK 는 앱 키 + 도메인 등록 + 제품 활성화가 모두 맞아야 하고,
 * 하나라도 어긋나면 403 으로 지도가 통째로 안 나온다. 실제로 그 상태를 겪었다.
 * 반면 아래 URL 들은 **아무 설정 없이 지금 동작한다.**
 * 약도는 map.kakao.com 검색 결과 페이지를 팝업(iframe)으로 띄워 대신한다.
 */

const BASE = 'https://map.kakao.com/link';

/** URL 경로에 들어가는 장소명 — 쉼표는 좌표 구분자라 반드시 걷어낸다. */
function safeName(name: string): string {
  return encodeURIComponent(name.replace(/,/g, ' ').trim());
}

export interface MapPlace {
  name: string;
  lat: number;
  lng: number;
}

/** 지도에서 위치 보기 */
export function kakaoMapUrl(p: MapPlace): string {
  return `${BASE}/map/${safeName(p.name)},${p.lat},${p.lng}`;
}

/** 로드뷰 — 실제 건물 입구를 눈으로 확인할 수 있어 길 안내에 효과적이다. */
export function kakaoRoadviewUrl(p: MapPlace): string {
  return `${BASE}/roadview/${p.lat},${p.lng}`;
}

export type TravelMode = 'traffic' | 'car' | 'walk' | 'bicycle';

/**
 * 목적지만 지정한 길찾기. 출발지는 카카오맵이 사용자의 현재 위치로 잡는다.
 * 경영주가 어디서 출발하든 정확한 경로가 나오므로, 우리가 노선을 적어 두는 것보다 정확하다.
 */
export function kakaoDirectionsUrl(p: MapPlace): string {
  return `${BASE}/to/${safeName(p.name)},${p.lat},${p.lng}`;
}

/**
 * 이동수단을 지정한 길찾기.
 * ⚠️ 카카오맵 `/link/by/` 는 출발지와 목적지를 모두 요구한다.
 *    출발지를 모를 때는 kakaoDirectionsUrl 을 써야 한다.
 */
export function kakaoDirectionsByUrl(mode: TravelMode, from: MapPlace, to: MapPlace): string {
  const a = `${safeName(from.name)},${from.lat},${from.lng}`;
  const b = `${safeName(to.name)},${to.lat},${to.lng}`;
  return `${BASE}/by/${mode}/${a}/${b}`;
}

/** 검색 결과로 열기 — 좌표가 부정확할 때의 보완 경로 */
export function kakaoSearchUrl(keyword: string): string {
  return `${BASE}/search/${encodeURIComponent(keyword)}`;
}
