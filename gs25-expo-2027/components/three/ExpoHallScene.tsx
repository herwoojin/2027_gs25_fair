'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Section } from '@/types';

export interface HallProps {
  sections: Section[];
  stamps: Record<string, number>;
  nextSectionId: string | null;
  onSelect: (section: Section) => void;
  quality: 'high' | 'low';
}

/**
 * T3-1 ⚡ · 박람회장 조감도.
 * - 아이소메트릭 느낌의 OrthographicCamera, 좌우 회전 ±30°, 줌 제한
 * - sections.hallPosition{x,z,w,d} 로 블록 배치 (코드 수정 없이 배치 변경 가능)
 * - 기본 도형 + 색으로 구현하고, 나중에 GLB 로 교체할 수 있도록 블록 단위로 분리
 */
export function ExpoHallScene(props: HallProps) {
  const { quality } = props;
  return (
    <Canvas
      // 저사양 기기 배려: 모바일 DPR 최대 1.5, 필요할 때만 렌더
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      frameloop="demand"
      shadows={quality === 'high'}
      orthographic
      camera={{ position: [26, 26, 26], zoom: 17, near: 0.1, far: 300 }}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
      className="touch-pan-y"
    >
      <color attach="background" args={['#eef4fb']} />
      <fog attach="fog" args={['#eef4fb', 70, 160]} />
      <HallContent {...props} />
    </Canvas>
  );
}

function HallContent({ sections, stamps, nextSectionId, onSelect, quality }: HallProps) {
  const { invalidate } = useThree();
  const [hovered, setHovered] = useState<string | null>(null);
  const zoomTarget = useRef<{ x: number; z: number; section: Section } | null>(null);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const path = useMemo(
    () =>
      sections
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((s) => new THREE.Vector3(s.hallPosition.x, 0.12, s.hallPosition.z)),
    [sections],
  );

  // 클릭 시 0.8초 동안 카메라가 해당 블록으로 줌인한 뒤 이동한다.
  useFrame((state, delta) => {
    const t = zoomTarget.current;
    if (!t) return;
    const cam = state.camera as THREE.OrthographicCamera;
    const goal = new THREE.Vector3(t.x + 14, 14, t.z + 14);
    cam.position.lerp(goal, Math.min(1, delta * 4));
    cam.zoom = THREE.MathUtils.lerp(cam.zoom, 42, Math.min(1, delta * 4));
    cam.updateProjectionMatrix();
    controls.current?.target.lerp(new THREE.Vector3(t.x, 0, t.z), Math.min(1, delta * 4));
    controls.current?.update();
    invalidate();
  });

  const handleSelect = useCallback(
    (s: Section) => {
      zoomTarget.current = { x: s.hallPosition.x, z: s.hallPosition.z, section: s };
      invalidate();
      setTimeout(() => onSelect(s), 800);
    },
    [invalidate, onSelect],
  );

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight
        position={[24, 38, 18]}
        intensity={1.5}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
      />
      <hemisphereLight args={['#ffffff', '#cddcf0', 0.6]} />

      {/* 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow={quality === 'high'}>
        <planeGeometry args={[76, 56]} />
        <meshStandardMaterial color="#f7fafd" />
      </mesh>
      <gridHelper args={[76, 38, '#dbe5f2', '#eaf0f8']} position={[0, 0, 0]} />

      {/* 입구 → 퇴점 동선 */}
      <Line points={path} color="#00c2a8" lineWidth={3} dashed dashSize={0.9} gapSize={0.6} />
      <Text position={[path[0].x, 0.4, path[0].z + 6.5]} rotation={[-Math.PI / 2, 0, 0]} fontSize={1.1} color="#0056b3">
        입구
      </Text>

      {/* 앰비언트 모션 — 고사양 기기에서만 (저사양은 정적 유지) */}
      {quality === 'high' && (
        <>
          <AmbientDust count={220} />
          <FloorSweep />
        </>
      )}

      {sections.map((s) => (
        <ZoneBlock
          key={s.id}
          section={s}
          stamped={!!stamps[s.id]}
          isNext={nextSectionId === s.id}
          hovered={hovered === s.id}
          onHover={(v) => {
            setHovered(v ? s.id : null);
            invalidate();
          }}
          onSelect={() => handleSelect(s)}
          quality={quality}
        />
      ))}

      <OrbitControls
        ref={controls}
        enablePan={false}
        enableRotate
        // 좌우 회전 ±30도만 허용
        minAzimuthAngle={-Math.PI / 6}
        maxAzimuthAngle={Math.PI / 6}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 3.1}
        minZoom={11}
        maxZoom={52}
        onChange={() => invalidate()}
        makeDefault
      />
    </>
  );
}

function ZoneBlock({
  section,
  stamped,
  isNext,
  hovered,
  onHover,
  onSelect,
  quality,
}: {
  section: Section;
  stamped: boolean;
  isNext: boolean;
  hovered: boolean;
  onHover: (v: boolean) => void;
  onSelect: () => void;
  quality: 'high' | 'low';
}) {
  const { x, z, w, d } = section.hallPosition;
  const h = stamped ? 1.5 : 2.2;
  const lift = hovered ? 0.6 : 0;
  const color = stamped ? '#9fb6cf' : (section.color ?? '#0056b3');

  return (
    <group position={[x, 0, z]}>
      <RoundedBox
        args={[w, h, d]}
        radius={0.28}
        smoothness={quality === 'high' ? 4 : 2}
        position={[0, h / 2 + lift, 0]}
        castShadow={quality === 'high'}
        receiveShadow={quality === 'high'}
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
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.05}
          emissive={hovered || isNext ? color : '#000000'}
          emissiveIntensity={hovered ? 0.35 : isNext ? 0.18 : 0}
        />
      </RoundedBox>

      {/* 섹션 번호 */}
      <Text
        position={[0, h + lift + 0.35, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={color}
      >
        {String(section.order).padStart(2, '0')}
      </Text>

      {/* 라벨 · 툴팁 */}
      <Html position={[0, h + lift + 1.1, 0]} center distanceFactor={26} zIndexRange={[20, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap">
          <div
            className={`rounded-pill px-2.5 py-1 text-[11px] font-bold shadow-card ${
              stamped ? 'bg-white/90 text-gs-muted' : 'bg-white text-gs-ink'
            }`}
          >
            {stamped && <span className="mr-1 text-gs-mint-dark">●</span>}
            {section.title}
          </div>
          {hovered && (
            <div className="mt-1 rounded-lg bg-gs-ink/92 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lift">
              <div>{stamped ? '스탬프 획득 완료' : '아직 스탬프 전'}</div>
              <div className="text-white/70">예상 {section.estMinutes}분</div>
            </div>
          )}
        </div>
      </Html>

      {/* 추천 다음 섹션 바닥 화살표 (T3-3) */}
      {isNext && !stamped && <NextArrow />}
    </group>
  );
}

/**
 * 전시장에 떠다니는 미세 입자.
 * frameloop="demand" 이므로 매 프레임 invalidate() 를 불러 이 구역만 계속 렌더된다.
 */
function AmbientDust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { invalidate } = useThree();

  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 66;
      pos[i * 3 + 1] = Math.random() * 16;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 48;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  useFrame((state, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = (pts.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += delta * 0.45;
      if (arr[i] > 16) arr[i] = 0;
    }
    pts.geometry.getAttribute('position').needsUpdate = true;
    pts.rotation.y = state.clock.elapsedTime * 0.012;
    invalidate();
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.22} color="#8fb4dd" transparent opacity={0.4} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** 바닥을 천천히 훑는 스포트라이트 — 전시장이 '살아 있는' 느낌을 준다 */
function FloorSweep() {
  const ref = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * 0.22;
    ref.current.position.x = Math.sin(t) * 26;
    ref.current.position.z = Math.cos(t * 0.7) * 17;
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.07 + Math.sin(t * 2) * 0.03;
    invalidate();
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <circleGeometry args={[9, 40]} />
      <meshBasicMaterial color="#00c2a8" transparent opacity={0.08} depthWrite={false} />
    </mesh>
  );
}

function NextArrow() {
  const ref = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = 0.3 + Math.sin(state.clock.elapsedTime * 2.6) * 0.25;
    invalidate();
  });
  return (
    <mesh ref={ref} position={[0, 0.3, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[0.9, 1.6, 4]} />
      <meshStandardMaterial color="#00c2a8" emissive="#00c2a8" emissiveIntensity={0.6} />
    </mesh>
  );
}
