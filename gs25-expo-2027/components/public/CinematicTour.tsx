'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { themeOf, toScene, type CityEnv } from '@/lib/cityTheme';

export interface TourCity {
  id: string;
  city: string;
  lat: number;
  lng: number;
  order: number;
}

interface Props {
  cities: TourCity[];
  /** 0~1 진행도. 매 프레임 setState 를 피하려고 ref 로 주고받는다. */
  progressRef: React.MutableRefObject<number>;
  /** 활성 도시가 바뀔 때만 호출된다. */
  onCityChange: (id: string) => void;
  quality: 'high' | 'low';
}

/**
 * 9개 도시를 잇는 시네마틱 카메라 투어.
 * 카메라가 CatmullRom 스플라인을 따라 날아가며 도시마다 다른 환경을 지난다.
 * 진행바는 영상이 아니라 **이 카메라 경로의 스크러버**다.
 */
export function CinematicTour(props: Props) {
  return (
    <Canvas
      dpr={props.quality === 'high' ? [1, 1.8] : [1, 1.25]}
      camera={{ fov: 52, near: 0.5, far: 400, position: [0, 14, 30] }}
      gl={{ antialias: props.quality === 'high', powerPreference: 'high-performance' }}
      // 카메라가 계속 움직이므로 상시 렌더. 대신 저사양은 DPR·오브젝트 수를 줄인다.
      frameloop="always"
    >
      <color attach="background" args={['#050a18']} />
      <fogExp2 attach="fog" args={['#050a18', 0.012]} />
      <TourScene {...props} />
    </Canvas>
  );
}

function TourScene({ cities, progressRef, onCityChange, quality }: Props) {
  const { camera } = useThree();
  const activeRef = useRef<string>('');
  const lookAt = useRef(new THREE.Vector3());

  const ordered = useMemo(() => [...cities].sort((a, b) => a.order - b.order), [cities]);

  const points = useMemo(
    () => ordered.map((c) => {
      const [x, z] = toScene(c.lat, c.lng);
      return new THREE.Vector3(x, 0, z);
    }),
    [ordered],
  );

  // 카메라 경로 / 시선 경로 (25fair 의 getCamWaypoints · getLookWaypoints 대응)
  const camCurve = useMemo(() => {
    if (points.length < 2) return null;
    return new THREE.CatmullRomCurve3(
      points.map((p, i) => new THREE.Vector3(p.x + (i % 2 ? 9 : -9), 11, p.z + 13)),
      false,
      'catmullrom',
      0.35,
    );
  }, [points]);

  const lookCurve = useMemo(() => {
    if (points.length < 2) return null;
    return new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, 2, p.z)),
      false,
      'catmullrom',
      0.35,
    );
  }, [points]);

  useFrame((_, delta) => {
    if (!camCurve || !lookCurve) return;
    const t = Math.min(0.999, Math.max(0, progressRef.current));

    const pos = camCurve.getPointAt(t);
    const look = lookCurve.getPointAt(t);

    // 목표 지점으로 부드럽게 따라가 스크럽할 때 튀지 않게 한다.
    camera.position.lerp(pos, Math.min(1, delta * 3.5));
    lookAt.current.lerp(look, Math.min(1, delta * 3.5));
    camera.lookAt(lookAt.current);

    // 활성 도시 = 진행도에 가장 가까운 구간
    const idx = Math.min(ordered.length - 1, Math.round(t * (ordered.length - 1)));
    const id = ordered[idx]?.id;
    if (id && id !== activeRef.current) {
      activeRef.current = id;
      onCityChange(id);
    }
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 40, 10]} intensity={0.7} color="#cfe0ff" />

      <Stars count={quality === 'high' ? 1400 : 500} />
      <Ground />
      <RouteLine points={points} />

      {ordered.map((c, i) => {
        const [x, z] = toScene(c.lat, c.lng);
        const theme = themeOf(c.id);
        return (
          <group key={c.id} position={[x, 0, z]}>
            <CityBeacon accent={theme.accent} order={i + 1} />
            <CityEnvironment env={theme.env} accent={theme.accent} quality={quality} seed={i} />
          </group>
        );
      })}
    </>
  );
}

/** 별 · 먼지 입자 */
function Stars({ count }: { count: number }) {
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 240;
      pos[i * 3 + 1] = Math.random() * 90 + 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 260;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.008;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.5} color="#9fc0ff" transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <planeGeometry args={[320, 360]} />
        <meshStandardMaterial color="#070d1e" roughness={1} metalness={0} />
      </mesh>
      <gridHelper args={[320, 64, '#14294d', '#0c1830']} position={[0, -0.28, 0]} />
    </>
  );
}

/** 입구 → 제주로 이어지는 순회 동선 */
function RouteLine({ points }: { points: THREE.Vector3[] }) {
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, 0.35, p.z)),
      false,
      'catmullrom',
      0.35,
    );
    return new THREE.TubeGeometry(curve, 220, 0.16, 8, false);
  }, [points]);

  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const m = ref.current?.material as THREE.MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.45 + Math.sin(state.clock.elapsedTime * 1.6) * 0.18;
  });

  if (!geo) return null;
  return (
    <mesh ref={ref} geometry={geo}>
      <meshBasicMaterial color="#00c2a8" transparent opacity={0.5} />
    </mesh>
  );
}

/** 도시 표식 — 빛기둥 + 확산 링 */
function CityBeacon({ accent, order }: { accent: string; order: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = (state.clock.elapsedTime * 0.6 + order * 0.35) % 1;
    if (ring.current) {
      ring.current.scale.setScalar(1 + t * 5);
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - t) * 0.55;
    }
    if (beam.current) {
      const m = beam.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + Math.sin(state.clock.elapsedTime * 2 + order) * 0.1;
    }
  });

  return (
    <group>
      <mesh ref={beam} position={[0, 7, 0]}>
        <cylinderGeometry args={[0.35, 0.9, 14, 12, 1, true]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[1.1, 1.35, 40]} />
        <meshBasicMaterial color={accent} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <pointLight position={[0, 3, 0]} color={accent} intensity={14} distance={22} />
    </group>
  );
}

/** 결정적 의사난수 — 새로고침해도 배치가 흔들리지 않게 한다. */
function rnd(seed: number, i: number): number {
  const v = Math.sin(seed * 97.13 + i * 41.7) * 43758.5453;
  return v - Math.floor(v);
}

/** 도시 성격에 따라 다른 환경을 세운다 (25fair 의 buildCherryTrees/buildOceanRings … 대응) */
function CityEnvironment({
  env,
  accent,
  quality,
  seed,
}: {
  env: CityEnv;
  accent: string;
  quality: 'high' | 'low';
  seed: number;
}) {
  const n = quality === 'high' ? 10 : 5;
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    if (env === 'lab' || env === 'island') group.current.rotation.y = state.clock.elapsedTime * 0.12;
    if (env === 'blossom') {
      group.current.children.forEach((c, i) => {
        c.position.y = 1.5 + Math.sin(state.clock.elapsedTime * 0.8 + i) * 0.6;
      });
    }
  });

  const items = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = rnd(seed, i) * Math.PI * 2;
        const r = 3.2 + rnd(seed, i + 50) * 5.5;
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          h: 0.8 + rnd(seed, i + 100) * 3.4,
          s: 0.3 + rnd(seed, i + 150) * 0.5,
        };
      }),
    [n, seed],
  );

  return (
    <group ref={group}>
      {items.map((it, i) => {
        switch (env) {
          case 'city':
          case 'neon':
            return (
              <mesh key={i} position={[it.x, it.h / 2, it.z]}>
                <boxGeometry args={[it.s, it.h, it.s]} />
                <meshStandardMaterial
                  color="#0d1a33"
                  emissive={accent}
                  emissiveIntensity={env === 'neon' ? 0.9 : 0.35}
                />
              </mesh>
            );
          case 'mountain':
          case 'field':
            return (
              <mesh key={i} position={[it.x, it.h / 2, it.z]}>
                <coneGeometry args={[it.s * 1.6, it.h, env === 'mountain' ? 5 : 8]} />
                <meshStandardMaterial color="#0f2438" emissive={accent} emissiveIntensity={0.28} />
              </mesh>
            );
          case 'blossom':
            return (
              <mesh key={i} position={[it.x, 1.5, it.z]}>
                <sphereGeometry args={[it.s * 0.5, 10, 10]} />
                <meshBasicMaterial color={accent} transparent opacity={0.75} />
              </mesh>
            );
          case 'lab':
            return (
              <mesh key={i} position={[it.x * 0.6, 1 + i * 0.45, it.z * 0.6]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[1.1 + i * 0.16, 0.035, 8, 40]} />
                <meshBasicMaterial color={accent} transparent opacity={0.55} />
              </mesh>
            );
          case 'industry':
            return (
              <mesh key={i} position={[it.x, it.h / 2, it.z]}>
                <cylinderGeometry args={[it.s * 0.55, it.s * 0.7, it.h, 10]} />
                <meshStandardMaterial color="#111e33" emissive={accent} emissiveIntensity={0.3} />
              </mesh>
            );
          case 'ocean':
            return (
              <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06 + i * 0.012, 0]}>
                <ringGeometry args={[2.5 + i * 1.5, 2.62 + i * 1.5, 48]} />
                <meshBasicMaterial color={accent} transparent opacity={0.3 - i * 0.022} side={THREE.DoubleSide} />
              </mesh>
            );
          case 'island':
            return (
              <mesh key={i} position={[it.x * 0.8, 1.1, it.z * 0.8]}>
                <sphereGeometry args={[it.s * 0.75, 10, 10]} />
                <meshStandardMaterial color="#123522" emissive={accent} emissiveIntensity={0.55} />
              </mesh>
            );
          default:
            return null;
        }
      })}
    </group>
  );
}
