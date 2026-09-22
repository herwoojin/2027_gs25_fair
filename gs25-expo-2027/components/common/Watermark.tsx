'use client';

import { useEffect, useRef, useState } from 'react';
import { callFn } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';

/**
 * T1-8 🔐 · 화면 전체 워터마크 (PRD S-07).
 * 점포코드 + 접속 시각(분 단위)을 -30도 사선으로 반복 표시한다.
 * 3D 캔버스 위에도 보이도록 최상위 z-index, pointer-events:none.
 * DOM 에서 제거·숨김되면 MutationObserver 가 감지해 재삽입하고 감사 로그를 남긴다.
 */
const MARK_ID = 'gs-watermark-layer';

export function Watermark() {
  const { user } = useSession();
  const [, forceRender] = useState(0);
  const reportedRef = useRef(0);

  const label = user
    ? `${user.storeCode ?? user.displayName} · ${new Date().toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : '';

  // 분 단위로 갱신
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;

    const report = (detail: string) => {
      const now = Date.now();
      // 과도한 로그 폭주를 막기 위해 10초에 한 번만 보고한다.
      if (now - reportedRef.current < 10_000) return;
      reportedRef.current = now;
      void callFn('reportWatermarkTamper', { detail }).catch(() => {});
    };

    const check = () => {
      const el = document.getElementById(MARK_ID);
      if (!el) {
        report('watermark element removed');
        forceRender((n) => n + 1);
        return;
      }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) {
        el.style.setProperty('display', 'block', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        report(`watermark hidden via css (${cs.display}/${cs.visibility}/${cs.opacity})`);
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    const interval = setInterval(check, 3000);
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [user]);

  if (!user) return null;

  const tile = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
      <text x="0" y="110" transform="rotate(-30 160 90)" font-family="sans-serif" font-size="17" fill="#0f223e" opacity="0.5">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
    </svg>`,
  );

  return (
    <div
      id={MARK_ID}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[9999] select-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,${tile}")`,
        backgroundRepeat: 'repeat',
        opacity: 0.07,
      }}
    />
  );
}
