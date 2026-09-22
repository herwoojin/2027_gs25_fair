'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Gift, MapPin, MessageCircle, QrCode, Ticket } from 'lucide-react';
import type { Coupon, ExpoEvent, Progress, Question, Reservation, Section, Survey } from '@/types';
import { SLOT_TIMES } from '@/types';
import { callFn } from '@/lib/api';
import { formatDateKo, relativeTime } from '@/lib/utils';
import { StampProgressBar } from '@/components/exhibit/StampProgressBar';

interface MyData {
  progress: Progress;
  sections: Section[];
  storeName: string;
  questions: Question[];
  reservation: Reservation | null;
  event: ExpoEvent | null;
  coupon: Coupon | null;
  survey: Survey | null;
}

/** T4-5 · /my — 스탬프 보드, 내 질문·답변, 예약, 쿠폰 상태 */
export default function MyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['myPage'],
    queryFn: () => callFn<MyData>('myPage'),
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="gs-skeleton h-24 w-full" />
        <div className="gs-skeleton h-56 w-full" />
      </div>
    );
  }

  const { progress, sections, storeName, questions, reservation, event, coupon } = data;
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-4 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{storeName}</h1>
        <p className="mt-1 text-gs-muted">
          {progress.completedAt
            ? `전국 ${progress.completionNo}번째로 완주하셨습니다.`
            : '스탬프를 모두 모으면 완주 쿠폰을 보내 드립니다.'}
        </p>
      </header>

      <StampProgressBar sections={sorted} stamps={progress.stamps} />

      {/* 스탬프 보드 */}
      <section>
        <h2 className="gs-section-title mb-3">스탬프 보드</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {sorted.map((s) => {
            const got = progress.stamps[s.id];
            return (
              <Link
                key={s.id}
                href={`/zone/${s.slug}`}
                className={`gs-card flex aspect-square flex-col items-center justify-center gap-1 p-2 text-center transition ${
                  got ? 'border-gs-mint bg-gs-mint/10' : 'hover:shadow-lift'
                }`}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-full text-sm font-black ${
                    got ? 'bg-gs-mint text-white' : 'bg-gs-line text-gs-muted'
                  }`}
                >
                  {got ? <Check size={18} /> : String(s.order).padStart(2, '0')}
                </span>
                <span className="line-clamp-2 text-xs font-bold leading-tight">{s.title}</span>
                {got && (
                  <span className="text-[0.6rem] text-gs-muted">
                    {new Date(got).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 이해도 */}
      <section className="gs-card p-4">
        <h2 className="text-base font-bold">내 이해도</h2>
        <p className="mt-1 text-sm text-gs-muted">퀴즈 첫 시도 정답률로 계산합니다.</p>
        <p className="mt-3 text-3xl font-black text-gs-blue">
          {progress.quizTotal > 0
            ? Math.round((progress.quizFirstTryCorrect / progress.quizTotal) * 100)
            : 0}
          %
          <span className="ml-2 text-base font-bold text-gs-muted">
            {progress.quizFirstTryCorrect}/{progress.quizTotal} 문항
          </span>
        </p>
      </section>

      {/* 예약 */}
      <section>
        <h2 className="gs-section-title mb-3">오프라인 방문 예약</h2>
        {reservation && event ? (
          <div className="gs-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">
                  {event.city} · {formatDateKo(reservation.date)}
                </p>
                <p className="text-gs-muted">{SLOT_TIMES[reservation.slotNo]}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-gs-muted">
                  <MapPin size={14} /> {event.venueName}
                </p>
                {reservation.engravingText && (
                  <p className="mt-2 text-sm">
                    각인 문구: <b>{reservation.engravingText}</b>
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-pill px-3 py-1 text-sm font-bold ${
                  reservation.status === 'checked_in'
                    ? 'bg-gs-mint/20 text-gs-mint-dark'
                    : 'bg-gs-blue-light text-gs-blue'
                }`}
              >
                {reservation.status === 'checked_in' ? '방문 완료' : '예약 확정'}
              </span>
            </div>
            <Link href="/offline/reserve" className="gs-btn-ghost mt-4 w-full">
              <QrCode size={17} /> 입장 QR 보기 · 예약 변경
            </Link>
          </div>
        ) : (
          <Link href="/offline/reserve" className="gs-card flex items-center gap-3 p-4 transition hover:shadow-lift">
            <MapPin className="text-gs-blue" size={22} />
            <span className="flex-1">
              <span className="block font-bold">아직 예약하지 않으셨습니다</span>
              <span className="block text-sm text-gs-muted">
                현장 기념품은 방문하신 분께만 드립니다.
              </span>
            </span>
          </Link>
        )}
      </section>

      {/* 쿠폰 */}
      <section>
        <h2 className="gs-section-title mb-3">완주 쿠폰</h2>
        <div className="gs-card flex items-center gap-3 p-4">
          <Ticket className={coupon?.status === 'sent' ? 'text-gs-mint-dark' : 'text-gs-muted'} size={22} />
          <div className="flex-1">
            {coupon?.status === 'sent' ? (
              <>
                <p className="font-bold text-gs-mint-dark">발송 완료</p>
                <p className="text-sm text-gs-muted">
                  쿠폰번호 {coupon.code} · {coupon.sentAt ? relativeTime(coupon.sentAt) : ''}
                </p>
              </>
            ) : progress.completedAt ? (
              <>
                <p className="font-bold">발송 대기 중</p>
                <p className="text-sm text-gs-muted">
                  행사 종료 후 등록된 번호로 일괄 발송됩니다.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-gs-muted">완주 후 발급</p>
                <p className="text-sm text-gs-muted">스탬프 11개를 모두 모아 주세요.</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 내 질문 */}
      <section>
        <h2 className="gs-section-title mb-3">내 질문 {questions.length}건</h2>
        {questions.length === 0 ? (
          <p className="gs-card p-4 text-gs-muted">아직 남기신 질문이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id} className="gs-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gs-muted">
                    <MessageCircle size={14} />
                    {q.sectionId ?? '본사'} · {relativeTime(q.createdAt)}
                  </span>
                  <span
                    className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${
                      q.answer ? 'bg-gs-mint/20 text-gs-mint-dark' : 'bg-gs-line text-gs-muted'
                    }`}
                  >
                    {q.answer ? '답변 완료' : '답변 대기'}
                  </span>
                </div>
                <p className="mt-2 text-base">{q.text}</p>
                {q.answer && (
                  <div className="mt-3 rounded-xl bg-gs-surface p-3">
                    <p className="text-sm font-bold text-gs-blue">{q.answer.byName}</p>
                    <p className="mt-1 text-base leading-relaxed">{q.answer.text}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/souvenir-promo" className="gs-btn-mint w-full">
        <Gift size={18} /> 현장 기념품 보러 가기
      </Link>
    </div>
  );
}
