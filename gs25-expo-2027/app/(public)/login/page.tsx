'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import type { AppUser } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { SITE } from '@/lib/config';
import { useSession } from '@/lib/hooks/useSession';
import { BrandMark } from '@/components/common/AppShell';

type Step = 'store' | 'last4' | 'otp' | 'consent';

/**
 * T1-4 · 경영주 로그인 — 점포코드 → 뒷4자리 → 인증번호(3분 타이머, 60초 후 재발송).
 * 한 손으로 조작 가능한 모바일 우선 레이아웃 + 큰 글씨.
 */
export default function LoginPage() {
  const router = useRouter();
  const { applySession, refresh } = useSession();

  const [step, setStep] = useState<Step>('store');
  const [storeCode, setStoreCode] = useState('');
  const [last4, setLast4] = useState('');
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remain, setRemain] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [pendingUser, setPendingUser] = useState<{ token: string; user: AppUser } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== 'otp') return;
    const id = setInterval(() => {
      setRemain((r) => Math.max(0, r - 1));
      setResendIn((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const requestOtp = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await callFn<{
        sessionId: string;
        maskedPhone: string;
        expiresInSec: number;
        devCode?: string;
      }>('requestOtp', { storeCode: storeCode.trim(), last4 });
      setSessionId(res.sessionId);
      setMaskedPhone(res.maskedPhone);
      setDevCode(res.devCode ?? null);
      setRemain(res.expiresInSec);
      setResendIn(60);
      setCode('');
      setStep('otp');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await callFn<{
        token: string;
        needsConsent: boolean;
        user: AppUser;
      }>('verifyOtp', { sessionId, code });
      if (res.needsConsent) {
        setPendingUser({ token: res.token, user: res.user });
        applySession(res.token, res.user);
        setStep('consent');
      } else {
        applySession(res.token, res.user);
        await refresh();
        router.replace('/lobby');
      }
    } catch (err) {
      setError((err as ApiError).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const acceptConsent = async () => {
    setBusy(true);
    try {
      await callFn('acceptConsent');
      await refresh();
      router.replace('/lobby');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'consent') {
    return <ConsentScreen busy={busy} onAccept={acceptConsent} storeName={pendingUser?.user.displayName ?? ''} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex min-h-touch items-center gap-2 text-gs-muted">
          <ArrowLeft size={20} /> <span className="sr-only">처음으로</span>
        </Link>
        <BrandMark compact />
        <span className="w-8" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-6">
        <div className="mb-8 rounded-2xl bg-gs-blue-light px-4 py-3 text-center">
          <p className="flex items-center justify-center gap-2 text-base font-bold text-gs-blue">
            <Lock size={16} /> 등록된 경영주님만 입장할 수 있습니다
          </p>
        </div>

        <StepDots step={step} />

        {step === 'store' && (
          <StepBox
            key="store"
            title="점포코드를 입력해 주세요"
            desc="점포 간판 또는 발주기에서 확인하실 수 있습니다."
          >
            <input
              ref={inputRef}
              className="gs-input text-center text-2xl font-bold tracking-widest"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="00000"
              value={storeCode}
              maxLength={12}
              onChange={(e) => setStoreCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && storeCode.length >= 3 && setStep('last4')}
            />
            <button
              className="gs-btn-primary w-full"
              disabled={storeCode.length < 3}
              onClick={() => setStep('last4')}
            >
              다음
            </button>
          </StepBox>
        )}

        {step === 'last4' && (
          <StepBox
            key="last4"
            title="휴대폰 뒷 4자리"
            desc="본부에 등록된 경영주님 휴대폰 번호의 마지막 4자리입니다."
            onBack={() => setStep('store')}
          >
            <input
              ref={inputRef}
              className="gs-input text-center text-3xl font-bold tracking-[0.6em]"
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              autoComplete="off"
              placeholder="••••"
              value={last4}
              maxLength={4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && last4.length === 4 && requestOtp()}
            />
            <button className="gs-btn-primary w-full" disabled={last4.length !== 4 || busy} onClick={requestOtp}>
              {busy ? '확인 중…' : '등록 번호로 인증번호 발송'}
            </button>
          </StepBox>
        )}

        {step === 'otp' && (
          <StepBox
            key="otp"
            title="인증번호 6자리"
            desc={`${maskedPhone} 로 보내 드렸습니다.`}
            onBack={() => setStep('last4')}
          >
            {devCode && (
              <div className="rounded-xl border-2 border-dashed border-gs-mint bg-gs-mint/10 p-3 text-center text-sm">
                <b className="text-gs-mint-dark">개발 모드</b> · 인증번호{' '}
                <b className="text-lg tracking-widest">{devCode}</b>
                <p className="mt-1 text-xs text-gs-muted">운영 환경에서는 절대 표시되지 않습니다.</p>
              </div>
            )}
            <input
              ref={inputRef}
              className="gs-input text-center text-3xl font-bold tracking-[0.4em]"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()}
            />
            <div className="flex items-center justify-between text-sm">
              <span className={remain > 0 ? 'font-semibold text-gs-blue' : 'text-state-critical'}>
                {remain > 0
                  ? `남은 시간 ${String(Math.floor(remain / 60)).padStart(2, '0')}:${String(remain % 60).padStart(2, '0')}`
                  : '유효 시간이 지났습니다'}
              </span>
              <button
                className="min-h-touch px-2 font-semibold text-gs-muted underline disabled:no-underline disabled:opacity-50"
                disabled={resendIn > 0 || busy}
                onClick={requestOtp}
              >
                {resendIn > 0 ? `재발송 ${resendIn}초` : '인증번호 재발송'}
              </button>
            </div>
            <button className="gs-btn-primary w-full" disabled={code.length !== 6 || busy} onClick={verify}>
              {busy ? '확인 중…' : '입장하기'}
            </button>
          </StepBox>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-center text-base font-semibold text-state-critical">
            {error}
          </p>
        )}

        <div className="mt-auto pt-10 text-center">
          <p className="text-sm text-gs-muted">
            번호가 바뀌셨나요?{' '}
            <a href={`tel:${SITE.ofcPhone}`} className="font-semibold text-gs-blue underline">
              담당 OFC에 문의
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const idx = ['store', 'last4', 'otp'].indexOf(step);
  return (
    <div className="mb-6 flex justify-center gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-2 rounded-pill transition-all ${i <= idx ? 'w-8 bg-gs-blue' : 'w-2 bg-gs-line'}`}
        />
      ))}
    </div>
  );
}

function StepBox({
  title,
  desc,
  children,
  onBack,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gs-ink">{title}</h1>
        <p className="mt-1.5 text-base text-gs-muted">{desc}</p>
      </div>
      {children}
      {onBack && (
        <button className="min-h-touch w-full text-sm font-semibold text-gs-muted" onClick={onBack}>
          이전 단계로
        </button>
      )}
    </motion.div>
  );
}

function ConsentScreen({
  busy,
  onAccept,
  storeName,
}: {
  busy: boolean;
  onAccept: () => void;
  storeName: string;
}) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <ShieldCheck className="mx-auto mb-3 text-gs-blue" size={40} />
        <h1 className="text-2xl font-bold">{storeName} 경영주님, 환영합니다</h1>
        <p className="mt-2 text-gs-muted">입장 전 두 가지만 확인해 주세요.</p>
      </div>

      <div className="space-y-4">
        <ConsentCard
          checked={a}
          onChange={setA}
          title="개인정보 수집·이용 동의 (필수)"
          body={`수집 항목: 점포코드, 경영주 휴대폰번호, 접속 기록\n이용 목적: 본인 확인, 행사 안내, 참여 현황 집계\n보유 기간: 행사 종료 후 3개월 내 파기\n동의를 거부하실 수 있으나, 이 경우 온라인 전시 이용이 제한됩니다.`}
        />
        <ConsentCard
          checked={b}
          onChange={setB}
          title="보안 서약 (필수)"
          body={`본 전시의 상품·전략 정보는 미공개 대외비입니다.\n· 화면 캡처, 녹화, 촬영 후 외부 공유를 하지 않습니다.\n· 계정을 타인과 공유하지 않습니다.\n· 모든 화면에는 점포코드와 접속 시각 워터마크가 표시되어, 유출 시 추적될 수 있습니다.`}
        />
      </div>

      <button className="gs-btn-primary mt-8 w-full" disabled={!a || !b || busy} onClick={onAccept}>
        {busy ? '처리 중…' : '동의하고 입장하기'}
      </button>
    </div>
  );
}

function ConsentCard({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label className="gs-card block cursor-pointer p-4">
      <span className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-6 w-6 shrink-0 accent-[rgb(var(--gs-blue))]"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          <span className="block text-base font-bold text-gs-ink">{title}</span>
          <span className="mt-2 block whitespace-pre-line text-sm leading-relaxed text-gs-muted">
            {body}
          </span>
        </span>
      </span>
    </label>
  );
}
