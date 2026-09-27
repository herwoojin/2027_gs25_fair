'use client';

import { useEffect, useRef } from 'react';

/**
 * 히어로 배경 영상 — 2027 GS25 PRODUCT SHOW 전시장 컷.
 *
 * 히어로에 머무는 내내 **계속 반복 재생한다.**
 * (한 번만 재생하고 3D 투어로 넘기던 방식은, 영상이 곧 사라져 버려 쓰지 않는다)
 *
 * 하이드레이션 주의 — autoPlay 를 JSX 에 두면 서버·클라이언트 속성이 갈린다.
 * 마크업은 항상 같게 두고 재생은 마운트 후 effect 에서 시작한다.
 * 그래서 '동작 줄이기' 설정이나 자동재생 차단 시에도 구조가 바뀌지 않고,
 * poster 이미지가 그대로 남아 배경 역할을 한다.
 */
export function HeroVideo({ mode = 'loop' }: { mode?: 'loop' }) {
  const ref = useRef<HTMLVideoElement>(null);

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
    if (reduced) return;

    v.loop = true;
    v.muted = true;
    // 브라우저가 자동재생을 막아도 poster 가 남으므로 화면이 비지 않는다.
    void v.play()?.catch(() => undefined);

    // 탭을 다시 열었을 때 멈춰 있는 경우가 있어 복귀 시 한 번 더 시도한다.
    const resume = () => {
      if (!document.hidden && v.paused) void v.play()?.catch(() => undefined);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [mode]);

  return (
    <div aria-hidden className="absolute inset-0">
      {/*
        선명하게 그대로 보여 준다. 간판 글씨와 제목이 겹치는 문제는
        블러가 아니라 제목을 간판 아래로 내리고 스크림을 조절해 해결했다.
      */}
      <video
        ref={ref}
        className="h-full w-full object-cover"
        style={{ filter: 'saturate(1.06) brightness(0.9)' }}
        poster="/media/hero-2027-poster.jpg"
        preload="auto"
        muted
        loop
        playsInline
        disablePictureInPicture
        tabIndex={-1}
      >
        <source src="/media/hero-2027.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
