'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';

/**
 * 영상·오디오 플레이어.
 * 실제 미디어 파일이 있으면 그대로 재생하고, 없으면(전시 준비 단계) 동일한 진행률 규칙을 따르는
 * 데모 플레이어로 대체한다. 어느 쪽이든 **90% 시청 시 onConsumed** 가 한 번 호출된다.
 */
export function MediaPlayer({
  src,
  durationSec,
  poster,
  kind = 'video',
  captionSrc,
  onProgress,
  onConsumed,
  autoPlayMuted = false,
}: {
  src?: string | null;
  durationSec: number;
  poster?: string | null;
  kind?: 'video' | 'audio';
  captionSrc?: string | null;
  onProgress?: (ratio: number) => void;
  onConsumed?: () => void;
  autoPlayMuted?: boolean;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(autoPlayMuted);
  const [elapsed, setElapsed] = useState(0);
  const consumedRef = useRef(false);
  const hasSrc = Boolean(src);

  const ratio = Math.min(1, durationSec > 0 ? elapsed / durationSec : 0);

  useEffect(() => {
    onProgress?.(ratio);
    if (ratio >= 0.9 && !consumedRef.current) {
      consumedRef.current = true;
      onConsumed?.();
    }
  }, [ratio, onProgress, onConsumed]);

  // 데모 모드 타이머
  useEffect(() => {
    if (hasSrc || !playing) return;
    const id = setInterval(() => {
      setElapsed((e) => {
        const next = e + 0.25;
        if (next >= durationSec) {
          setPlaying(false);
          return durationSec;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [hasSrc, playing, durationSec]);

  const toggle = () => {
    if (hasSrc && mediaRef.current) {
      if (playing) mediaRef.current.pause();
      else void mediaRef.current.play();
    }
    setPlaying((p) => !p);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="overflow-hidden rounded-card border border-gs-line bg-gs-ink">
      <div className="relative aspect-video w-full bg-gradient-to-br from-gs-blue-dark to-gs-ink">
        {hasSrc && kind === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            className="h-full w-full object-contain"
            src={src ?? undefined}
            poster={poster ?? undefined}
            muted={muted}
            playsInline
            controlsList="nodownload"
            disablePictureInPicture
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            {captionSrc && <track kind="captions" srcLang="ko" label="한국어" src={captionSrc} default />}
          </video>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-white/15">
              {playing ? <Pause size={26} /> : <Play size={26} />}
            </div>
            <p className="text-sm text-white/70">
              {playing ? '재생 중입니다' : '재생 버튼을 눌러 시청해 주세요'}
            </p>
            <p className="text-xs text-white/40">
              영상 파일은 관리자 화면에서 업로드합니다 (서명 URL로 제공)
            </p>
          </div>
        )}

        {/* 소리 켜기 안내 (F-13 · 음소거 시작) */}
        {muted && playing && (
          <button
            onClick={() => {
              setMuted(false);
              if (mediaRef.current) mediaRef.current.muted = false;
            }}
            className="absolute inset-x-0 bottom-16 mx-auto flex w-max items-center gap-2 rounded-pill bg-white px-5 py-3 text-base font-bold text-gs-ink shadow-lift"
          >
            <VolumeX size={20} /> 탭하여 소리 켜기
          </button>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <button
          onClick={toggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25"
          aria-label={playing ? '일시정지' : '재생'}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-pill bg-white/20">
            <div
              className="h-full rounded-pill bg-gs-mint transition-[width] duration-200"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-white/60">
            <span>{fmt(elapsed)}</span>
            <span>
              {ratio >= 0.9 ? '시청 완료' : `${Math.round(ratio * 100)}% · 90%까지 보시면 완료됩니다`}
            </span>
            <span>{fmt(durationSec)}</span>
          </div>
        </div>
        <button
          onClick={() => {
            setMuted((m) => {
              if (mediaRef.current) mediaRef.current.muted = !m;
              return !m;
            });
          }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label={muted ? '소리 켜기' : '음소거'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>
    </div>
  );
}
