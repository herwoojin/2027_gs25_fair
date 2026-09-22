'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, PartyPopper } from 'lucide-react';
import type { Section } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { useToast } from '@/components/common/Toast';
import { Certificate, type CertificateData } from './Certificate';
import { MediaPlayer } from './MediaPlayer';

const QUESTIONS = [
  '오늘 전시 내용이 점포 운영에 도움이 되었나요?',
  '상품 설명이 이해하기 쉬웠나요?',
  '3D 전시장 이용이 편리했나요?',
  '오프라인 행사에도 방문하실 의향이 있나요?',
  '내년에도 온라인 공유회가 열린다면 참여하시겠어요?',
];

const SCALE = ['전혀 아니다', '아니다', '보통', '그렇다', '매우 그렇다'];

/** T4-4 · 퇴점 — 전 스탬프 확인 → 설문 → 완주 처리 → 수료증 */
export function ExitZone() {
  const { progress, refresh } = useSession();
  const toast = useToast();
  const [answers, setAnswers] = useState<number[]>([0, 0, 0, 0, 0]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [certificate, setCertificate] = useState<CertificateData | null>(null);

  const { data: index } = useQuery({
    queryKey: ['exhibitIndex'],
    queryFn: () => callFn<{ sections: Section[] }>('getExhibitIndex'),
    staleTime: 10 * 60 * 1000,
  });

  const sections = (index?.sections ?? []).filter((s) => s.slug !== 'exit');
  const stamps = progress?.stamps ?? {};
  const missing = sections.filter((s) => !stamps[s.id]);
  const alreadyDone = !!progress?.completedAt;

  const submit = async () => {
    setBusy(true);
    try {
      const res = await callFn<{ certificate: CertificateData }>('submitSurvey', {
        q1: answers[0],
        q2: answers[1],
        q3: answers[2],
        q4: answers[3],
        q5: answers[4],
        comment: comment.trim() || undefined,
      });
      setCertificate(res.certificate);
      await refresh();
      toast.push('완주하셨습니다! 축하드립니다.', 'success');
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (certificate || alreadyDone) {
    return (
      <div className="space-y-6">
        <div className="rounded-card bg-gradient-to-br from-gs-blue to-gs-mint px-5 py-8 text-center text-white">
          <PartyPopper className="mx-auto mb-2" size={36} />
          <h2 className="text-2xl font-bold">완주를 축하드립니다!</h2>
          <p className="mt-1 text-white/85">
            완주 쿠폰은 행사 종료 후 등록된 번호로 보내 드립니다.
          </p>
        </div>

        <MediaPlayer src={null} durationSec={38} autoPlayMuted />

        {certificate && <Certificate data={certificate} />}

        <Link href="/my" className="gs-btn-primary w-full sm:w-auto">
          내 스탬프 보드 보기
        </Link>
      </div>
    );
  }

  if (missing.length > 0) {
    return (
      <div className="space-y-4">
        <div className="gs-card p-5">
          <h2 className="text-xl font-bold">아직 {missing.length}곳이 남았습니다</h2>
          <p className="mt-1 text-gs-muted">
            모든 섹션의 스탬프를 모으시면 완주 설문과 수료증을 받으실 수 있습니다.
          </p>
          <ul className="mt-4 space-y-2">
            {sections.map((s) => {
              const done = !!stamps[s.id];
              return (
                <li key={s.id}>
                  <Link
                    href={`/zone/${s.slug}`}
                    className={`flex min-h-touch items-center gap-3 rounded-xl px-3 py-2 transition ${
                      done ? 'bg-gs-surface text-gs-muted' : 'bg-white hover:bg-gs-blue-light'
                    }`}
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                        done ? 'bg-gs-mint text-white' : 'bg-gs-line text-gs-muted'
                      }`}
                    >
                      {done ? <Check size={14} /> : String(s.order).padStart(2, '0')}
                    </span>
                    <span className="flex-1 font-semibold">{s.title}</span>
                    {!done && <span className="text-sm font-bold text-gs-blue">이동</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  const canSubmit = answers.every((a) => a >= 1);

  return (
    <div className="space-y-5">
      <div className="gs-card p-5">
        <h2 className="text-xl font-bold">스탬프 10개를 모두 모으셨습니다</h2>
        <p className="mt-1 text-gs-muted">
          마지막으로 5문항 설문에 답해 주시면 완주 처리되고 수료증이 발급됩니다.
        </p>
      </div>

      <div className="gs-card divide-y divide-gs-line">
        {QUESTIONS.map((q, qi) => (
          <fieldset key={qi} className="p-4">
            <legend className="mb-3 text-base font-semibold">
              {qi + 1}. {q}
            </legend>
            <div className="grid grid-cols-5 gap-1.5">
              {SCALE.map((label, si) => {
                const value = si + 1;
                const on = answers[qi] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAnswers((a) => a.map((v, i) => (i === qi ? value : v)))}
                    className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-[0.7rem] font-semibold transition ${
                      on
                        ? 'border-gs-blue bg-gs-blue-light text-gs-blue'
                        : 'border-gs-line text-gs-muted hover:bg-gs-surface'
                    }`}
                  >
                    <span className="text-base font-black">{value}</span>
                    <span className="leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="p-4">
          <label className="block">
            <span className="mb-2 block text-base font-semibold">남기고 싶은 의견 (선택)</span>
            <textarea
              className="gs-input min-h-[6rem] resize-none py-3"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="본부에 전하고 싶은 의견을 자유롭게 적어 주세요."
            />
          </label>
        </div>
      </div>

      <button className="gs-btn-primary w-full" disabled={!canSubmit || busy} onClick={submit}>
        {busy ? '처리 중…' : '설문 제출하고 완주하기'}
      </button>
    </div>
  );
}
