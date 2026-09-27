'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bus, Car, Check, Copy, ExternalLink, Eye, Map, MapPin, Navigation, Plane, Search, Train, X } from 'lucide-react';
import type { ExpoEvent } from '@/types';
import { kakaoDirectionsUrl, kakaoRoadviewUrl, kakaoSearchUrl, type MapPlace } from '@/lib/kakaoMap';

/**
 * 오시는 길 — 약도 팝업 · 대중교통 · 주차.
 *
 * 지도는 카카오맵 검색 결과 페이지를 그대로 팝업에 띄운다.
 * JavaScript SDK 를 쓰지 않으므로 **앱 키도, 도메인 등록도, 제품 활성화도 필요 없다.**
 * (SDK 방식은 앱에서 카카오맵 제품이 꺼져 있으면 403 으로 막힌다)
 *
 * 노선을 글로만 적어 두면 출발지마다 달라 쓸모가 떨어진다.
 * 그래서 **카카오맵 길찾기를 1순위**로 둔다 — 사용자의 현재 위치에서 실시간 경로가 나온다.
 */

const KAKAO_MAP_ORIGIN = 'https://map.kakao.com';

function kakaoEmbedUrl(query: string): string {
  return `${KAKAO_MAP_ORIGIN}/?q=${encodeURIComponent(query)}`;
}

function Row({ icon, label, lines }: { icon: React.ReactNode; label: string; lines: string[] }) {
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

/** 카카오맵 검색 결과를 띄우는 팝업 */
function MapDialog({
  initialQuery,
  title,
  onClose,
}: {
  initialQuery: string;
  title: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [src, setSrc] = useState(() => kakaoEmbedUrl(initialQuery));
  const closeRef = useRef<HTMLButtonElement>(null);

  // 팝업이 열려 있는 동안 배경 스크롤을 막고, Esc 로 닫는다.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) setSrc(kakaoEmbedUrl(q));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} 지도`}
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[86dvh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-gs-line px-4 py-3">
          <Map size={18} className="shrink-0 text-gs-blue" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-[0.95rem] font-bold text-gs-ink">{title}</p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-touch items-center gap-1.5 rounded-pill border border-gs-line px-3 text-sm font-semibold text-gs-ink transition hover:bg-gs-surface"
          >
            <ExternalLink size={15} aria-hidden /> 새 창
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="지도 닫기"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gs-muted transition hover:bg-gs-surface"
          >
            <X size={20} />
          </button>
        </header>

        {/* 검색란 — 주소가 미리 들어가 있고, 고쳐서 다시 찾을 수도 있다 */}
        <form onSubmit={search} className="flex gap-2 border-b border-gs-line px-4 py-3">
          <label htmlFor="venue-map-q" className="sr-only">
            지도에서 검색할 주소
          </label>
          <input
            id="venue-map-q"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            autoComplete="off"
            className="min-h-touch flex-1 rounded-xl border border-gs-line px-3.5 text-[0.95rem] text-gs-ink outline-none focus:border-gs-blue"
            placeholder="주소 또는 장소명"
          />
          <button
            type="submit"
            className="flex min-h-touch items-center gap-1.5 rounded-xl bg-gs-blue px-4 text-[0.95rem] font-bold text-white transition hover:brightness-110"
          >
            <Search size={16} aria-hidden /> 검색
          </button>
        </form>

        <iframe
          key={src}
          src={src}
          title={`${title} 카카오맵`}
          className="min-h-0 w-full flex-1 border-0"
          referrerPolicy="no-referrer-when-downgrade"
          loading="lazy"
        />

        <p className="border-t border-gs-line px-4 py-2.5 text-xs leading-relaxed text-gs-muted">
          지도가 보이지 않으면 <b>새 창</b>을 눌러 주세요. 카카오맵 화면에서 길찾기·로드뷰를 바로 쓸 수
          있습니다.
        </p>
      </div>
    </div>
  );
}

export function VenueDirections({ event }: { event: ExpoEvent }) {
  const [mapOpen, setMapOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const place: MapPlace = { name: event.venueName, lat: event.lat, lng: event.lng };
  const query = `${event.address} ${event.venueName}`;

  const close = useCallback(() => setMapOpen(false), []);

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

      <div className="flex flex-wrap gap-2 border-b border-gs-line px-5 py-4">
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-xl bg-gs-blue px-4 text-[0.95rem] font-bold text-white transition hover:brightness-110"
        >
          <MapPin size={17} aria-hidden /> 지도에서 위치 확인
        </button>
        <a
          href={kakaoDirectionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-touch items-center justify-center gap-2 rounded-xl border border-gs-line px-4 text-[0.95rem] font-semibold text-gs-ink transition hover:bg-gs-surface"
        >
          <Navigation size={17} aria-hidden /> 길찾기
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

      {mapOpen && (
        <MapDialog
          initialQuery={query}
          title={`${event.city} · ${event.venueName}`}
          onClose={close}
        />
      )}

      {/* 검색 결과 페이지로 직접 가는 경로 — 팝업이 막히는 환경 대비 */}
      <a href={kakaoSearchUrl(query)} className="sr-only" target="_blank" rel="noopener noreferrer">
        카카오맵에서 {event.venueName} 검색 결과 열기
      </a>
    </section>
  );
}
