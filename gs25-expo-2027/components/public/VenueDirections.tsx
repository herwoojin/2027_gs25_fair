'use client';

import { useEffect, useRef, useState } from 'react';
import { Bus, Car, Copy, Check, MapPin, Navigation, Train, Eye, Plane } from 'lucide-react';
import type { ExpoEvent } from '@/types';
import {
  kakaoDirectionsUrl,
  kakaoJsKey,
  kakaoMapUrl,
  kakaoRoadviewUrl,
  type MapPlace,
} from '@/lib/kakaoMap';

/** SDK 를 여러 번 넣지 않도록 문서당 한 번만 로드한다. */
let sdkPromise: Promise<void> | null = null;

function loadKakaoSdk(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  const w = window as typeof window & { kakao?: { maps?: { load?: (cb: () => void) => void } } };
  if (w.kakao?.maps?.load) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    // autoload=false → load() 를 직접 불러 초기화 시점을 통제한다.
    el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    el.async = true;
    el.onload = () => {
      // 카카오맵 서비스가 꺼져 있거나 키가 잘못되면 403 JSON 본문이 내려온다.
      // 그 본문은 공교롭게도 실행 가능한 JS 라 onerror 가 아닌 onload 가 불린다.
      // 그래서 로드 성공 여부는 전역 객체로 직접 확인해야 한다.
      const w2 = window as typeof window & { kakao?: { maps?: unknown } };
      if (w2.kakao?.maps) resolve();
      else reject(new Error('sdk-unavailable'));
    };
    el.onerror = () => reject(new Error('sdk-load-failed'));
    document.head.appendChild(el);
  });
  // 실패를 캐시해 두면 설정을 고친 뒤에도 계속 실패한다. 다음 시도를 위해 비운다.
  sdkPromise.catch(() => {
    sdkPromise = null;
  });
  return sdkPromise;
}

/** 지도 임베드. 키가 없거나 로드에 실패하면 아무것도 그리지 않고 부모에게 알린다. */
function KakaoMap({ place, onFail }: { place: MapPlace; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = kakaoJsKey();
    if (!key) {
      onFail();
      return;
    }
    let cancelled = false;

    loadKakaoSdk(key)
      .then(() => {
        if (cancelled || !box.current) return;
        const w = window as unknown as {
          kakao: {
            maps: {
              load: (cb: () => void) => void;
              LatLng: new (lat: number, lng: number) => unknown;
              Map: new (el: HTMLElement, o: Record<string, unknown>) => unknown;
              Marker: new (o: Record<string, unknown>) => { setMap: (m: unknown) => void };
            };
          };
        };
        w.kakao.maps.load(() => {
          if (cancelled || !box.current) return;
          const center = new w.kakao.maps.LatLng(place.lat, place.lng);
          const map = new w.kakao.maps.Map(box.current, { center, level: 4 });
          new w.kakao.maps.Marker({ position: center }).setMap(map);
        });
      })
      .catch(() => {
        // 도메인 미등록·키 오류·네트워크 차단 — 링크 안내로 대체된다.
        if (!cancelled) onFail();
      });

    return () => {
      cancelled = true;
    };
  }, [place, onFail]);

  return <div ref={box} className="h-full w-full" aria-label="약도" />;
}

function Row({
  icon,
  label,
  lines,
}: {
  icon: React.ReactNode;
  label: string;
  lines: string[];
}) {
  if (lines.length === 0) return null;
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-gs-blue" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="text-sm font-bold text-gs-ink">{label}</p>
        <ul className="mt-1 space-y-1">
          {lines.map((l) => (
            <li key={l} className="text-[0.95rem] leading-relaxed text-gs-muted">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * 오시는 길 — 약도 · 대중교통 · 주차.
 *
 * 노선을 글로만 적어 두면 출발지마다 달라 쓸모가 떨어진다.
 * 그래서 **카카오맵 길찾기 링크를 1순위**로 두었다. 사용자의 현재 위치에서
 * 실시간 경로가 나오므로 우리가 적은 안내보다 언제나 정확하다.
 */
export function VenueDirections({ event }: { event: ExpoEvent }) {
  const [mapFailed, setMapFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const place: MapPlace = { name: event.venueName, lat: event.lat, lng: event.lng };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(`${event.venueName} (${event.address})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gs-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gs-line px-5 py-4">
        <div>
          <h3 className="text-lg font-bold text-gs-ink">오시는 길</h3>
          <p className="mt-0.5 text-sm text-gs-muted">
            {event.venueName} · {event.address}
          </p>
        </div>
        <button
          type="button"
          onClick={copyAddress}
          className="flex min-h-touch items-center gap-1.5 rounded-pill border border-gs-line px-3.5 text-sm font-semibold text-gs-ink transition hover:bg-gs-surface"
        >
          {copied ? <Check size={15} className="text-state-ok" /> : <Copy size={15} />}
          {copied ? '주소 복사됨' : '주소 복사'}
        </button>
      </header>

      {/* 약도 — 키가 없으면 자리를 차지하지 않고 링크 안내로 대체된다 */}
      <div className="relative h-56 w-full bg-gs-surface sm:h-72">
        {mapFailed ? (
          <a
            href={kakaoMapUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-center"
          >
            <MapPin size={28} className="text-gs-blue" aria-hidden />
            <span className="text-sm font-semibold text-gs-ink">카카오맵에서 위치 보기</span>
            <span className="px-6 text-xs text-gs-muted">
              약도를 이 화면에 띄우려면 카카오 JavaScript 키 등록이 필요합니다.
            </span>
          </a>
        ) : (
          <KakaoMap place={place} onFail={() => setMapFailed(true)} />
        )}
      </div>

      {/* 1순위 행동 — 현재 위치 기준 길찾기 */}
      <div className="flex flex-wrap gap-2 border-b border-gs-line px-5 py-4">
        <a
          href={kakaoDirectionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-xl bg-gs-blue px-4 text-[0.95rem] font-bold text-white transition hover:brightness-110"
        >
          <Navigation size={17} aria-hidden /> 길찾기
        </a>
        <a
          href={kakaoMapUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-touch items-center justify-center gap-2 rounded-xl border border-gs-line px-4 text-[0.95rem] font-semibold text-gs-ink transition hover:bg-gs-surface"
        >
          <MapPin size={17} aria-hidden /> 크게 보기
        </a>
        <a
          href={kakaoRoadviewUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-touch items-center justify-center gap-2 rounded-xl border border-gs-line px-4 text-[0.95rem] font-semibold text-gs-ink transition hover:bg-gs-surface"
        >
          <Eye size={17} aria-hidden /> 로드뷰
        </a>
      </div>
      <p className="px-5 pt-3 text-xs leading-relaxed text-gs-muted">
        길찾기를 누르면 카카오맵이 <b>현재 계신 곳에서 출발하는 경로</b>를 안내합니다. 지하철·버스·자가용
        모두 그 화면에서 고를 수 있습니다.
      </p>

      {/* 대중교통 */}
      {event.transit && (
        <div className="space-y-4 px-5 py-4">
          <Row icon={<Train size={18} />} label="지하철·기차" lines={event.transit.rail} />
          <Row icon={<Bus size={18} />} label="버스" lines={event.transit.bus} />
          <Row icon={<Plane size={18} />} label="그 밖의 경로" lines={event.transit.etc} />
          {event.transit.walk && (
            <p className="rounded-xl bg-gs-surface px-4 py-3 text-[0.9rem] leading-relaxed text-gs-muted">
              {event.transit.walk}
            </p>
          )}
        </div>
      )}

      {/* 주차 */}
      {event.parking && (
        <div className="border-t border-gs-line px-5 py-4">
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-gs-blue" aria-hidden>
              <Car size={18} />
            </span>
            <div>
              <p className="text-sm font-bold text-gs-ink">
                주차 {event.parking.available ? '가능' : '불가'}
              </p>
              <ul className="mt-1 space-y-1 text-[0.95rem] leading-relaxed text-gs-muted">
                {event.parking.capacity && <li>{event.parking.capacity}</li>}
                {event.parking.fee && <li>{event.parking.fee}</li>}
                {event.parking.note && <li>{event.parking.note}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
