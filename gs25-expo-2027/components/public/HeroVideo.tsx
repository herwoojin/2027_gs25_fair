'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 히어로 배경 영상 — 2027 GS25 PRODUCT SHOW 입구에서 전시장 안으로 들어가는 실사 컷.
 *
 * 두 가지로 쓰인다.
 *   loop  … 3D 를 못 쓰는 기기. 배경으로 계속 반복 재생한다.
 *   intro … 3D 를 쓰는 기기. 한 번 재생한 뒤 사라지며 시네마틱 투어로 넘긴다.
 *
 * 하이드레이션 주의 — autoPlay 를 JSX 에 두면 서버·클라이언트 속성이 갈린다.
 * 마크업은 항상 같게 두고 재생은 마운트 후 effect 에서 시작한다.
 * 그래서 '동작 줄이기' 설정이나 자동재생 차단 시에도 구조가 바뀌지 않고,
 * poster 이미지가 그대로 남아 배경 역할을 한다.
 */
export function HeroVideo({
  mode,
  onIntroEnd,
}: {
  mode: 'loop' | 'intro';
  onIntroEnd?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
    // 동작 줄이기를 켠 사용자에게는 정지 화면(poster)만 보여 준다.
    if (reduced) {
      if (mode === 'intro') {
        setDone(true);
        onIntroEnd?.();
      }
      return;
    }

    v.loop = mode === 'loop';
    v.muted = true;
    const p = v.play();
    // 브라우저가 자동재생을 막아도 poster 가 남으므로 화면이 비지 않는다.
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (mode === 'intro') {
          setDone(true);
          onIntroEnd?.();
        }
      });
    }

    if (mode !== 'intro') return;
    const end = () => {
      setDone(true);
      onIntroEnd?.();
    };
    v.addEventListener('ended', end);
    return () => v.removeEventListener('ended', end);
  }, [mode, onIntroEnd]);

  return (
    <div
      aria-hidden
      className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
      style={{ opacity: done ? 0 : 1 }}
    >
      {/*
        배경 영상은 흐리게 깐다. 영상 안에 "GS25 PRODUCT SHOW 2027" 간판 글씨가 크게 박혀 있어
        그대로 두면 히어로 제목과 겹쳐 둘 다 안 읽힌다(4.5px 로는 여전히 겹쳤고 7px 에서 해결됐다).
        결과적으로 제목만 또렷한 피사계 심도 연출이 된다.
        확대는 blur 가장자리에 생기는 빈 테두리를 가리기 위함.
      */}
      <video
        ref={ref}
        className="h-full w-full object-cover"
        style={{ filter: 'blur(7px) saturate(1.1) brightness(0.92)', transform: 'scale(1.12)' }}
        poster="/media/hero-2027-poster.jpg"
        preload="metadata"
        muted
        playsInline
        disablePictureInPicture
        tabIndex={-1}
      >
        <source src="/media/hero-2027.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
