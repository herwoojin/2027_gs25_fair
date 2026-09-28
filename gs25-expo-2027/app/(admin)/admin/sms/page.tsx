'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Moon,
  Send,
  XCircle,
} from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';

/**
 * 문자 발송 설정 점검 · 테스트.
 *
 * 문자는 "안 나가도 화면에는 아무 일도 없다" 는 게 무서운 기능이다.
 * 키가 없으면 log 모드로 조용히 기록만 되기 때문에, 행사 당일에야
 * "인증번호가 안 와요" 로 알게 된다. 그래서 상태를 한 화면에서 보고
 * 실제로 한 통 보내 볼 수 있게 한다.
 */

interface SmsStatus {
  mode: 'live' | 'log';
  configured: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  senderMasked: string;
  allowlistCount: number;
  nightBlocked: boolean;
  opsNumberSet: boolean;
  balance: { balance: number; point: number } | null;
  balanceError: string | null;
  recent: { id: string; code: string; toMasked: string; body: string; status: string; at: number }[];
}

interface TestResult {
  ok: boolean;
  status: string;
  error?: string;
  mode: 'live' | 'log';
}

/** 인라인 코드 표시용 */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gs-surface px-1.5 py-0.5 font-mono text-xs font-bold text-gs-ink">
      {children}
    </code>
  );
}

export default function SmsPage() {
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [text, setText] = useState('[GS25 상품전략공유회] 발송 테스트입니다.');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['smsStatus'],
    queryFn: () => callFn<SmsStatus>('adminSmsStatus'),
    refetchInterval: 30_000,
  });

  const test = useMutation({
    mutationFn: () => callFn<TestResult>('adminSmsTest', { to: to.trim(), text: text.trim() }),
    onSuccess: (r) => {
      setResult(
        r.mode === 'log'
          ? { ok: false, message: 'log 모드라 기록만 되고 실제로는 발송되지 않았습니다.' }
          : r.ok
            ? { ok: true, message: `발송했습니다 (${r.status}). 문자가 도착했는지 확인해 주세요.` }
            : { ok: false, message: `발송 실패: ${r.error ?? r.status}` },
      );
      void qc.invalidateQueries({ queryKey: ['smsStatus'] });
    },
    onError: (e) => setResult({ ok: false, message: (e as ApiError).message ?? '발송하지 못했습니다.' }),
  });

  const live = data?.mode === 'live';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">문자 발송</h1>
        <p className="text-sm text-gs-muted">
          경영주 로그인 인증번호 · 예약 안내 문자가 실제로 나가는지 점검합니다.
        </p>
      </header>

      {/* ── 발송 모드 ── */}
      <div className="gs-card flex flex-wrap items-start gap-3 p-4">
        <MessageSquare
          className={cn('shrink-0', live ? 'text-gs-mint-dark' : 'text-state-danger')}
          size={20}
        />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold text-gs-ink">
            발송 모드{' '}
            <span className={live ? 'text-gs-mint-dark' : 'text-state-danger'}>
              {isLoading ? '확인 중…' : live ? 'live · 실제 발송' : 'log · 기록만'}
            </span>
          </p>
          {data && !live && (
            <p className="mt-1 leading-relaxed text-gs-muted">
              지금은 문자가 기록만 되고 <b className="text-gs-ink">실제로는 나가지 않습니다.</b>{' '}
              {data.configured ? (
                <>
                  키·발신번호는 모두 있습니다. 환경변수 <Code>SMS_MODE</Code> 가{' '}
                  <Code>log</Code> 또는 <Code>off</Code> 로 지정돼 발송을 막고 있으니,{' '}
                  <Code>live</Code> 로 바꾸거나 변수를 삭제하고 재배포해 주세요.
                </>
              ) : (
                <>아래 항목에서 ✕ 표시된 값을 Netlify 환경변수에 넣고 재배포해 주세요.</>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── 허용목록 경고 ── */}
      {data && data.allowlistCount > 0 && (
        <div className="gs-card flex gap-3 border-2 border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="shrink-0 text-amber-600" size={20} />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-bold">
              수신 허용목록이 켜져 있습니다 — 등록된 {data.allowlistCount}개 번호로만 발송됩니다.
            </p>
            <p className="mt-1">
              개발 중 대량 오발송을 막는 안전장치입니다. 지금 상태로 행사를 열면 다른 경영주는
              인증번호를 받지 못합니다. <b>운영 개시 전에 Netlify 의 `SMS_ALLOWLIST` 변수를 삭제하고
              재배포</b>해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* ── 설정 항목 ── */}
      <div className="gs-card divide-y divide-gs-line">
        <Row label="API 키 (SOLAPI_API_KEY)" ok={data?.hasApiKey} loading={isLoading} />
        <Row label="API 시크릿 (SOLAPI_API_SECRET)" ok={data?.hasApiSecret} loading={isLoading} />
        <Row
          label="발신번호 (SOLAPI_SENDER)"
          ok={!!data?.senderMasked}
          loading={isLoading}
          value={data?.senderMasked || '미설정'}
          hint="솔라피 콘솔에 사전 등록된 번호여야 합니다."
        />
        <Row
          label="운영 담당 번호"
          ok={data?.opsNumberSet}
          loading={isLoading}
          hint="질의 에스컬레이션 알림을 받을 번호입니다."
        />
        <Row
          label="솔라피 잔액"
          ok={data?.balance != null}
          loading={isLoading}
          value={
            data?.balance
              ? `${data.balance.balance.toLocaleString('ko-KR')}원 · ${data.balance.point.toLocaleString('ko-KR')}P`
              : (data?.balanceError ?? '조회 실패')
          }
          hint={data?.balance ? undefined : '조회에 실패하면 키가 틀렸을 가능성이 큽니다.'}
        />
      </div>

      {data?.nightBlocked && (
        <p className="flex items-center gap-2 rounded-xl bg-gs-surface px-4 py-3 text-sm text-gs-muted">
          <Moon size={15} className="shrink-0" />
          지금은 야간(21~08시)이라 <b className="text-gs-ink">광고성 문자</b>가 차단됩니다. 인증번호 등
          필수 문자는 정상 발송됩니다.
        </p>
      )}

      {/* ── 테스트 발송 ── */}
      <section className="gs-card space-y-3 p-4">
        <h2 className="text-base font-bold">테스트 발송</h2>
        <p className="text-sm text-gs-muted">
          실제로 한 통 보내 봅니다. 관리자가 직접 누른 것이므로 야간에도 차단되지 않습니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <label className="block">
            <span className="block text-xs font-bold text-gs-muted">받는 번호</span>
            <input
              className="gs-input mt-1 w-full text-sm"
              placeholder="01012345678"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-gs-muted">내용</span>
            <input
              className="gs-input mt-1 w-full text-sm"
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        </div>
        <button
          className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
          onClick={() => {
            setResult(null);
            test.mutate();
          }}
          disabled={test.isPending || to.replace(/[^0-9]/g, '').length < 10 || !text.trim()}
        >
          {test.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 테스트
          발송
        </button>

        {result && (
          <p
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-semibold',
              result.ok ? 'bg-gs-mint-light text-gs-mint-dark' : 'bg-red-50 text-state-critical',
            )}
          >
            {result.message}
          </p>
        )}
      </section>

      {/* ── 최근 발송 ── */}
      <section className="gs-card overflow-x-auto">
        <p className="border-b border-gs-line px-4 py-3 text-sm font-bold">최근 발송 20건</p>
        <table className="w-full min-w-[38rem] text-sm">
          <thead className="bg-gs-surface text-left text-gs-muted">
            <tr>
              {['시각', '템플릿', '수신(마스킹)', '상태', '내용'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.recent ?? []).map((l) => (
              <tr key={l.id} className="border-t border-gs-line/60">
                <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{relativeTime(l.at)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-bold">{l.code}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{l.toMasked}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gs-muted">{l.status}</td>
                <td className="max-w-[22rem] truncate px-3 py-2">{l.body}</td>
              </tr>
            ))}
            {(data?.recent.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gs-muted">
                  발송 이력이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Row({
  label,
  ok,
  loading,
  value,
  hint,
}: {
  label: string;
  ok?: boolean;
  loading?: boolean;
  value?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      {loading ? (
        <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin text-gs-muted" />
      ) : ok ? (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-gs-mint-dark" />
      ) : (
        <XCircle size={17} className="mt-0.5 shrink-0 text-state-danger" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gs-ink">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-gs-muted">{hint}</p>}
      </div>
      {value && <span className="shrink-0 font-mono text-xs text-gs-muted">{value}</span>}
    </div>
  );
}
