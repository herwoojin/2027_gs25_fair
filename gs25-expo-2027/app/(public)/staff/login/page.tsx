'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import type { AppUser } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { useSession } from '@/lib/hooks/useSession';
import { BrandMark } from '@/components/common/AppShell';

interface SendResult {
  sessionId: string;
  expiresInSec: number;
  maskedEmail: string;
  delivery: 'email' | 'queued' | 'dev';
  devCode?: string;
  /** 메일러가 설정돼 있는데 발송이 실패한 경우의 원인 (로컬 개발 전용) */
  mailError?: string;
  remainingQuota?: number;
}

/**
 * T1-5 · 본부(MD·운영자·관리자) 로그인.
 * @gsretail.com 도메인만 허용하고, Google Apps Script 가 해당 주소로 6자리 인증번호를 메일 발송한다.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const { applySession, refresh } = useSession();

  const [phase, setPhase] = useState<'cred' | 'otp'>('cred');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<SendResult | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [remain, setRemain] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (phase !== 'otp') return;
    const id = setInterval(() => {
      setRemain((r) => Math.max(0, r - 1));
      setResendIn((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await callFn<SendResult>('staffLogin', { email: email.trim() });
      setSent(res);
      setRemain(res.expiresInSec);
      setResendIn(60);
      setCode('');
      setPhase('otp');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sent) return;
    setBusy(true);
    setError('');
    try {
      const res = await callFn<{ token: string; user: AppUser }>('staffVerify', {
        sessionId: sent.sessionId,
        code,
      });
      applySession(res.token, res.user);
      await refresh();
      router.replace(res.user.role === 'operator' ? '/admin/reservations' : '/admin/dashboard');
    } catch (err) {
      setError((err as ApiError).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-gs-surface">
      <header className="flex items-center justify-between bg-white px-4 py-3">
        <Link href="/" className="flex min-h-touch items-center text-gs-muted">
          <ArrowLeft size={20} />
        </Link>
        <BrandMark compact />
        <span className="w-8" />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
        <div className="gs-card p-6">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="text-gs-blue" size={22} /> 본부 로그인
          </h1>
          <p className="mt-1.5 text-sm text-gs-muted">
            <b className="text-gs-ink">@gsretail.com</b> 회사 이메일로만 로그인할 수 있으며, 해당 주소로
            인증번호를 보내 드립니다.
          </p>

          {phase === 'cred' ? (
            <form className="mt-6 space-y-4" onSubmit={send}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">회사 이메일</span>
                <input
                  className="gs-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@gsretail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <p className="text-sm text-gs-muted">
                비밀번호는 없습니다. 입력하신 회사 이메일로 인증번호를 보내 드립니다.
              </p>
              <button
                className="gs-btn-primary w-full"
                disabled={busy || !/^[^@\s]+@gsretail\.com$/i.test(email.trim())}
              >
                <Mail size={17} /> {busy ? '메일 보내는 중…' : '인증번호 발송'}
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={verify}>
              {sent?.delivery === 'queued' && (
                <div className="rounded-xl bg-gs-blue-light px-4 py-3 text-sm">
                  <p className="flex items-center gap-1.5 font-bold text-gs-blue">
                    <Mail size={15} /> {sent.maskedEmail} 로 보내는 중입니다
                  </p>
                  <p className="mt-1 text-gs-muted">
                    최대 1분 안에 도착합니다. 메일함에 없으면 스팸함도 확인해 주세요.
                  </p>
                </div>
              )}

              {sent?.delivery === 'email' && (
                <div className="rounded-xl bg-gs-blue-light px-4 py-3 text-sm">
                  <p className="flex items-center gap-1.5 font-bold text-gs-blue">
                    <Mail size={15} /> {sent.maskedEmail} 로 보냈습니다
                  </p>
                  <p className="mt-1 text-gs-muted">메일함에 없으면 스팸함도 확인해 주세요.</p>
                </div>
              )}

              {sent?.delivery === 'dev' && sent.devCode && (
                <div className="rounded-xl border-2 border-dashed border-gs-mint bg-gs-mint/10 p-3 text-center text-sm">
                  <b className="text-gs-mint-dark">
                    {sent.mailError ? '메일 발송 실패 · 개발 모드' : '메일러 미연결 · 개발 모드'}
                  </b>{' '}
                  · 인증번호 <b className="text-lg tracking-widest">{sent.devCode}</b>
                  <p className="mt-1 text-xs text-gs-muted">
                    {sent.mailError
                      ? sent.mailError
                      : 'APPS_SCRIPT_URL / APPS_SCRIPT_KEY 를 설정하면 실제 메일이 발송됩니다.'}
                  </p>
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">인증번호 6자리</span>
                <input
                  className="gs-input text-center text-2xl tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </label>

              <div className="flex items-center justify-between text-sm">
                <span className={remain > 0 ? 'font-semibold text-gs-blue' : 'text-state-critical'}>
                  {remain > 0
                    ? `남은 시간 ${String(Math.floor(remain / 60)).padStart(2, '0')}:${String(remain % 60).padStart(2, '0')}`
                    : '유효 시간이 지났습니다'}
                </span>
                <button
                  type="button"
                  className="min-h-touch px-2 font-semibold text-gs-muted underline disabled:no-underline disabled:opacity-50"
                  disabled={resendIn > 0 || busy}
                  onClick={() => send()}
                >
                  {resendIn > 0 ? `재발송 ${resendIn}초` : '인증번호 재발송'}
                </button>
              </div>

              <button className="gs-btn-primary w-full" disabled={code.length !== 6 || busy}>
                {busy ? '확인 중…' : '로그인'}
              </button>
              <button
                type="button"
                className="min-h-touch w-full text-sm font-semibold text-gs-muted"
                onClick={() => {
                  setPhase('cred');
                  setError('');
                }}
              >
                다른 계정으로 로그인
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">
              {error}
            </p>
          )}

          <details className="mt-6 rounded-xl bg-gs-surface p-3 text-sm text-gs-muted">
            <summary className="cursor-pointer font-semibold">로그인이 안 되나요?</summary>
            <ul className="mt-2 space-y-1">
              <li>· 회사 이메일(@gsretail.com)인지 확인해 주세요.</li>
              <li>· 본부 계정 원장(구글시트 Staff 탭)에 등록된 주소만 인증번호를 받습니다.</li>
              <li>· 메일이 오지 않으면 스팸함을 확인하고, 60초 후 재발송을 눌러 주세요.</li>
              <li>· 5회 잘못 입력하면 30분간 잠깁니다.</li>
            </ul>
          </details>
        </div>
      </main>
    </div>
  );
}
