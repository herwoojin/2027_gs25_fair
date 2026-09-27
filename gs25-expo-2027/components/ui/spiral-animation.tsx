'use client';

import { useEffect, useRef } from 'react';

/**
 * 나선형 파티클 배경.
 *
 * 원안(spiral-animation / xubh.top)은 gsap 타임라인으로 전체화면을 검게 칠하고 그린다.
 * 여기서는 **섹션 배경**으로 쓰므로 두 가지를 바꿨다.
 *   1. gsap 대신 requestAnimationFrame — 배경 장식 하나에 약 70KB 라이브러리를 얹지 않는다.
 *      (같은 이유로 CrowdCanvas 도 이렇게 만들었다)
 *   2. 매 프레임 검게 칠하지 않고 clearRect 로 지운다. 섹션 배경색이 그대로 비쳐야 한다.
 *
 * 파티클 수도 원안의 5000개에서 크게 줄였다. 배경에서 5000개를 매 프레임 투영·묘화하면
 * 저사양 기기에서 스크롤이 끊긴다.
 *
 * 성능·접근성
 *   - 화면 밖이거나 탭이 숨겨지면 멈춘다. 보이지도 않는 애니메이션이 배터리를 먹으면 안 된다.
 *   - '동작 줄이기' 설정이면 움직이지 않고 한 장면만 그린다.
 */

const TURNS = 6;
const SPIRAL_R = 170;
const VIEW_ZOOM = 100;
const CAMERA_Z = -400;
const TRAVEL = 3400;
const CHANGE_AT = 0.32;
const CYCLE_SEC = 15;
const TRAIL = 60;

interface Particle {
  /** 나선 위의 위치 0~1 */
  at: number;
  /** 퍼져 나가는 방향 */
  angle: number;
  dist: number;
  spin: 1 | -1;
  z: number;
  weight: number;
}

const ease = (p: number, g: number) =>
  p < 0.5 ? 0.5 * Math.pow(2 * p, g) : 1 - 0.5 * Math.pow(2 * (1 - p), g);

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const mapRange = (v: number, a1: number, b1: number, a2: number, b2: number) =>
  a2 + (b2 - a2) * ((v - a1) / (b1 - a1));
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** 나선 경로 위의 좌표 */
function spiralPath(p: number): [number, number] {
  const q = ease(clamp(1.2 * p, 0, 1), 1.8);
  const theta = 2 * Math.PI * TURNS * Math.sqrt(q);
  const r = SPIRAL_R * Math.sqrt(q);
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

export function SpiralAnimation({
  color = '#ffffff',
  count = 900,
  className,
}: {
  /** 파티클 색 — 섹션 강조색과 맞춘다 */
  color?: string;
  count?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }

    // 매번 같은 모양이 나오도록 고정 시드를 쓴다. 새로고침마다 배치가 달라지면 산만하다.
    let seed = 1234;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const particles: Particle[] = Array.from({ length: count }, () => {
      const at = (1 - Math.pow(1 - rnd(), 3)) / 1.3;
      const z0 = 0.5 * CAMERA_Z + rnd() * (TRAVEL + CAMERA_Z - 0.5 * CAMERA_Z);
      return {
        at,
        angle: rnd() * Math.PI * 2,
        dist: 22 + rnd() * 46,
        spin: rnd() > 0.5 ? 1 : -1,
        z: lerp(z0, TRAVEL / 2, 0.3 * at),
        weight: 0.35 + 0.65 * Math.pow(rnd(), 1.5),
      };
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let disposed = false;
    let running = false;
    let start = 0;

    const layout = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** 3D 좌표를 화면에 찍는다 */
    const dot = (x3: number, y3: number, z3: number, size: number, camZ: number, alpha: number) => {
      const depth = z3 - camZ;
      if (depth <= 1) return;
      const x = (VIEW_ZOOM * x3) / depth;
      const y = (VIEW_ZOOM * y3) / depth;
      const r = Math.min(5, Math.max(0.5, (1100 * size) / depth));
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (time: number) => {
      const t = (time % (CYCLE_SEC * 1000)) / (CYCLE_SEC * 1000);
      const t1 = clamp(mapRange(t, 0, CHANGE_AT + 0.25, 0, 1), 0, 1);
      const t2 = clamp(mapRange(t, CHANGE_AT, 1, 0, 1), 0, 1);
      const camZ = CAMERA_Z + ease(Math.pow(t2, 1.2), 1.8) * TRAVEL;
      // 들어오고 나갈 때 부드럽게 — 루프 이음매가 눈에 띄지 않게 한다
      const fade = Math.sin(Math.PI * clamp(t / 0.92, 0, 1));

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      // 나선 자체는 반경 170 의 고정 크기다. 섹션 높이에 맞춰 키워야 배경으로 읽힌다.
      const k = Math.max(1.3, Math.min(w / 760, h / 400));
      ctx.scale(k, k);
      ctx.rotate(-Math.PI * ease(t2, 2.7));
      ctx.fillStyle = color;
      ctx.globalCompositeOperation = 'lighter';

      // 나선을 따라 달리는 머리 부분
      for (let i = 0; i < TRAIL; i++) {
        const f = mapRange(i, 0, TRAIL, 1.1, 0.1);
        const [sx, sy] = spiralPath(t1 - 0.00018 * i);
        const size = (1.2 * (1 - t1) + 2.6 * Math.sin(Math.PI * t1)) * f;
        ctx.globalAlpha = 0.5 * f * fade;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.4, size / 2), 0, Math.PI * 2);
        ctx.fill();
      }

      // 머리가 지나간 자리에서 퍼져 나가는 입자
      for (const p of particles) {
        const q = t1 - p.at;
        if (q <= 0) continue;
        const prog = clamp(4 * q, 0, 1);
        const [sx, sy] = spiralPath(p.at);

        // 직선으로 밀려나다가 나선을 그리며 흩어진다
        const spiralAngle = p.angle + 1.2 * p.spin * prog * Math.PI;
        const reach = p.dist * (0.4 + 3.2 * Math.pow(prog, 1.3));
        const px = lerp(sx, sx + reach * Math.cos(spiralAngle), ease(prog, 1.6));
        const py = lerp(sy, sy + reach * Math.sin(spiralAngle), ease(prog, 1.6));

        const depth = p.z - CAMERA_Z;
        dot(
          (depth * px) / VIEW_ZOOM,
          (depth * py) / VIEW_ZOOM,
          p.z,
          6.5 * p.weight * (1 - 0.35 * prog),
          camZ,
          (0.85 - 0.5 * prog) * fade,
        );
      }

      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const tick = (time: number) => {
      if (disposed) return;
      if (!start) start = time;
      frame(time - start);
      raf = requestAnimationFrame(tick);
    };

    const play = () => {
      if (running || disposed || reduced) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    layout();
    // 첫 장면을 바로 그린다 — 관찰자가 늦게 붙어도 캔버스가 비어 있지 않게 한다.
    frame(CYCLE_SEC * 500);

    // 기본은 재생. 화면 밖으로 나가면 관찰자가 멈춘다.
    // (관찰자가 동작하지 않는 환경에서도 애니메이션이 사라지지 않도록 이 순서를 지킨다)
    play();
    const io = new IntersectionObserver(
      ([e]) => (e?.isIntersecting && !document.hidden ? play() : stop()),
      { threshold: 0.01 },
    );
    io.observe(canvas);

    const onVisible = () => (document.hidden ? stop() : play());
    const onResize = () => {
      layout();
      if (reduced) frame(CYCLE_SEC * 500);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('resize', onResize);
    };
  }, [color, count]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
