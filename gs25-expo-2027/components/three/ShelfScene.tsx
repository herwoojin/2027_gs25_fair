'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Product, ShelfFixture } from '@/types';
import { SHELF_TOUR_EVENT } from '@/lib/shelfTour';

/**
 * T3-4 ⚡ · 표준매장 3D.
 * 곤돌라(5단) · 워크인 쿨러 · 카운터 · FF 진열대를 파라미터로 생성하고,
 * products.shelf{fixture,bay,row,col} 좌표에 상품 박스를 배치한다.
 * (텍스처는 운영에서 Storage 서명 URL 로 로드 — 여기서는 색 박스로 대체)
 */

interface FixtureSpec {
  fixture: ShelfFixture;
  label: string;
  /** 진열대 원점 */
  position: [number, number, number];
  rotationY: number;
  bays: number;
  rows: number;
  cols: number;
  bayWidth: number;
  rowHeight: number;
}

const LAYOUT: FixtureSpec[] = [
  { fixture: 'walkin', label: '워크인 쿨러', position: [0, 0, -5.4], rotationY: 0, bays: 4, rows: 4, cols: 3, bayWidth: 2.2, rowHeight: 0.52 },
  { fixture: 'gondola', label: '곤돌라 A', position: [-4.2, 0, -1], rotationY: 0, bays: 4, rows: 5, cols: 3, bayWidth: 2.0, rowHeight: 0.42 },
  { fixture: 'gondola', label: '곤돌라 B', position: [-4.2, 0, 1.8], rotationY: 0, bays: 4, rows: 5, cols: 3, bayWidth: 2.0, rowHeight: 0.42 },
  { fixture: 'island', label: '행사 매대', position: [3.4, 0, 0.6], rotationY: 0, bays: 2, rows: 2, cols: 3, bayWidth: 1.6, rowHeight: 0.4 },
  { fixture: 'ff', label: 'FF 진열대', position: [3.6, 0, -3.4], rotationY: 0, bays: 2, rows: 3, cols: 2, bayWidth: 1.7, rowHeight: 0.45 },
  { fixture: 'counter', label: '카운터', position: [0, 0, 4.6], rotationY: 0, bays: 3, rows: 2, cols: 3, bayWidth: 2.0, rowHeight: 0.4 },
];

function slotPosition(spec: FixtureSpec, bay: number, row: number, col: number): [number, number, number] {
  const totalW = spec.bays * spec.bayWidth;
  const x = spec.position[0] - totalW / 2 + spec.bayWidth * (bay + 0.5) + (col - (spec.cols - 1) / 2) * 0.45;
  const y = 0.35 + row * spec.rowHeight;
  const z = spec.position[2];
  return [x, y, z];
}

export function ShelfScene({
  products,
  visited,
  onSelect,
  quality,
}: {
  products: Product[];
  visited: Record<string, boolean>;
  onSelect: (p: Product) => void;
  quality: 'high' | 'low';
}) {
  return (
    <Canvas
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      frameloop="demand"
      shadows={quality === 'high'}
      camera={{ position: [0, 7.5, 12], fov: 42, near: 0.1, far: 120 }}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#f2f6fb']} />
      <ShelfContent products={products} visited={visited} onSelect={onSelect} quality={quality} />
    </Canvas>
  );
}

export interface ShelfSceneHandle {
  startTour: () => void;
}

function ShelfContent({
  products,
  visited,
  onSelect,
  quality,
}: {
  products: Product[];
  visited: Record<string, boolean>;
  onSelect: (p: Product) => void;
  quality: 'high' | 'low';
}) {
  const { invalidate } = useThree();
  const [hovered, setHovered] = useState<string | null>(null);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  // shelf 좌표가 없는 상품은 순서대로 빈 슬롯에 채워 넣는다.
  const placed = useMemo(() => {
    const used = new Set<string>();
    return products.map((p, i) => {
      const spec =
        LAYOUT.find((l) => l.fixture === p.shelf?.fixture) ?? LAYOUT[i % LAYOUT.length];
      let bay = p.shelf?.bay ?? i % spec.bays;
      let row = p.shelf?.row ?? 2;
      let col = p.shelf?.col ?? 1;
      let key = `${spec.label}-${bay}-${row}-${col}`;
      let guard = 0;
      while (used.has(key) && guard < 40) {
        bay = (bay + 1) % spec.bays;
        if (bay === 0) row = (row + 1) % spec.rows;
        key = `${spec.label}-${bay}-${row}-${col}`;
        guard += 1;
      }
      used.add(key);
      return { product: p, spec, pos: slotPosition(spec, bay, Math.min(row, spec.rows - 1), col) };
    });
  }, [products]);

  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[6, 12, 8]} intensity={1.4} castShadow={quality === 'high'} />
      <hemisphereLight args={['#ffffff', '#d7e3f2', 0.55]} />

      {/* 바닥 · 벽 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={quality === 'high'}>
        <planeGeometry args={[26, 20]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <gridHelper args={[26, 26, '#e2eaf4', '#eef3f9']} />

      {LAYOUT.map((spec) => (
        <Fixture key={spec.label} spec={spec} quality={quality} />
      ))}

      {placed.map(({ product, pos }) => (
        <ProductBox
          key={product.id}
          product={product}
          position={pos}
          done={!!visited[product.id]}
          hovered={hovered === product.id}
          onHover={(v) => {
            setHovered(v ? product.id : null);
            invalidate();
          }}
          onSelect={() => onSelect(product)}
        />
      ))}

      <AutoTour controls={controls} />

      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        minDistance={5}
        maxDistance={20}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.25}
        onChange={() => invalidate()}
      />
    </>
  );
}

function Fixture({ spec, quality }: { spec: FixtureSpec; quality: 'high' | 'low' }) {
  const totalW = spec.bays * spec.bayWidth;
  const height = 0.3 + spec.rows * spec.rowHeight;
  const isCooler = spec.fixture === 'walkin';

  return (
    <group position={spec.position} rotation={[0, spec.rotationY, 0]}>
      {/* 본체 */}
      <RoundedBox
        args={[totalW, height, spec.fixture === 'counter' ? 1.0 : 0.85]}
        radius={0.06}
        smoothness={quality === 'high' ? 3 : 1}
        position={[0, height / 2, -0.28]}
        castShadow={quality === 'high'}
        receiveShadow={quality === 'high'}
      >
        <meshStandardMaterial
          color={isCooler ? '#cfe6f5' : spec.fixture === 'counter' ? '#31435c' : '#e8eef6'}
          transparent={isCooler}
          opacity={isCooler ? 0.55 : 1}
          roughness={0.6}
        />
      </RoundedBox>

      {/* 선반 */}
      {Array.from({ length: spec.rows }, (_, r) => (
        <mesh key={r} position={[0, 0.3 + r * spec.rowHeight - 0.07, 0]} receiveShadow={quality === 'high'}>
          <boxGeometry args={[totalW - 0.08, 0.04, 0.72]} />
          <meshStandardMaterial color="#c9d5e4" />
        </mesh>
      ))}

      <Text
        position={[0, height + 0.32, 0]}
        fontSize={0.3}
        color="#62748d"
        anchorX="center"
        anchorY="middle"
      >
        {spec.label}
      </Text>
    </group>
  );
}

function ProductBox({
  product,
  position,
  done,
  hovered,
  onHover,
  onSelect,
}: {
  product: Product;
  position: [number, number, number];
  done: boolean;
  hovered: boolean;
  onHover: (v: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, 0.16, 0]}
        scale={hovered ? 1.18 : 1}
        castShadow
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[0.36, 0.32, 0.26]} />
        <meshStandardMaterial
          color={done ? '#9fb6cf' : (product.color ?? '#0056b3')}
          emissive={hovered ? '#00c2a8' : '#000000'}
          emissiveIntensity={hovered ? 0.5 : 0}
          roughness={0.5}
        />
      </mesh>
      {hovered && (
        <Html position={[0, 0.62, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-lg bg-gs-ink/92 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lift">
            {product.name}
            {done && <span className="ml-1 text-gs-mint">완료</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

/** [한 바퀴 자동 투어] — 진열대 순서대로 카메라 이동, 각 구역 2초 정지 */
function AutoTour({ controls }: { controls: React.RefObject<React.ComponentRef<typeof OrbitControls>> }) {
  const { invalidate, camera } = useThree();
  const state = useRef<{ running: boolean; idx: number; hold: number }>({
    running: false,
    idx: 0,
    hold: 0,
  });

  const start = useCallback(() => {
    state.current = { running: true, idx: 0, hold: 0 };
    invalidate();
  }, [invalidate]);

  // 부모(UI 버튼)에서 커스텀 이벤트로 제어한다.
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(SHELF_TOUR_EVENT, handler);
    return () => window.removeEventListener(SHELF_TOUR_EVENT, handler);
  }, [start]);

  useFrame((_, delta) => {
    const s = state.current;
    if (!s.running) return;
    const spec = LAYOUT[s.idx];
    if (!spec) {
      s.running = false;
      return;
    }
    const goal = new THREE.Vector3(spec.position[0], 3.4, spec.position[2] + 5.2);
    camera.position.lerp(goal, Math.min(1, delta * 2.2));
    controls.current?.target.lerp(new THREE.Vector3(spec.position[0], 1.2, spec.position[2]), Math.min(1, delta * 2.2));
    controls.current?.update();

    if (camera.position.distanceTo(goal) < 0.35) {
      s.hold += delta;
      if (s.hold > 2) {
        s.hold = 0;
        s.idx += 1;
        if (s.idx >= LAYOUT.length) s.running = false;
      }
    }
    invalidate();
  });

  return null;
}
