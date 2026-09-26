/**
 * 카카오맵 연동.
 *
 * 두 갈래로 나뉜다.
 *   1) 지도 URL 링크 — **앱 키가 필요 없다.** 길찾기·로드뷰·크게보기가 여기에 해당하며,
 *      사용자 환경에 따라 PC/모바일 카카오맵으로 자동 연결된다.
 *   2) JavaScript SDK 임베드 — 앱 키와 도메인 등록이 필요하다.
 *      키가 없으면 임베드만 빠지고 1)은 그대로 동작한다.
 *
 * 그래서 키를 아직 발급받지 못한 상태에서도 '오시는 길'은 온전히 쓸 수 있다.
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

/** JavaScript SDK 키. 없으면 지도 임베드를 건너뛴다. */
export function kakaoJsKey(): string {
  return process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '';
}
