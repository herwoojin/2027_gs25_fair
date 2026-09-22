'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, CheckCircle2, LogIn, MessageCircleQuestion, Users } from 'lucide-react';
import type { AggregateStats } from '@/types';
import { REGIONS } from '@/types';
import { callFn } from '@/lib/api';

/** T8-1 · 관리자 대시보드 — aggregates/stats 1건 구독 */
export default function DashboardPage() {
  const { data } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => callFn<{ stats: AggregateStats }>('getAggregates', { kind: 'stats' }),
    refetchInterval: 60_000,
  });

  const s = data?.stats;

  const regionData = REGIONS.map((r) => {
    const v = s?.regions[r.code];
    return {
      name: r.short,
      로그인율: v ? Number(((v.loggedIn / v.registered) * 100).toFixed(1)) : 0,
      완주율: v ? Number(((v.completed / Math.max(1, v.loggedIn)) * 100).toFixed(1)) : 0,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">실시간 현황</h1>
        <p className="text-sm text-gs-muted">
          {s ? `${new Date(s.updatedAt).toLocaleTimeString('ko-KR')} 기준 · 1분마다 갱신` : '불러오는 중…'}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card icon={Activity} label="현재 접속자" value={s?.onlineNow} accent />
        <Card icon={LogIn} label="오늘 로그인" value={s?.todayLoginCount} />
        <Card icon={Users} label="누적 로그인" value={s?.loginCount} sub={s ? `등록 ${s.registeredCount.toLocaleString()}` : ''} />
        <Card
          icon={CheckCircle2}
          label="완주자"
          value={s?.completedCount}
          sub={s ? `${((s.completedCount / Math.max(1, s.loginCount)) * 100).toFixed(1)}%` : ''}
        />
        <Card icon={MessageCircleQuestion} label="미응답 질문" value={s?.openQuestionCount} warn={(s?.openQuestionCount ?? 0) > 0} />
      </div>

      <section className="gs-card p-4">
        <h2 className="mb-3 text-base font-bold">지역별 로그인율 · 완주율 (%)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="로그인율" fill="#0056b3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="완주율" fill="#00c2a8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="gs-card p-4">
        <h2 className="mb-1 text-base font-bold">섹션별 스탬프 퍼널</h2>
        <p className="mb-3 text-sm text-gs-muted">어느 섹션에서 이탈하는지 확인하세요.</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={s?.sectionStamps ?? []} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="title" width={110} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {(s?.sectionStamps ?? []).map((_, i) => (
                  <Cell key={i} fill={i % 2 ? '#2b7fff' : '#0056b3'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="gs-card p-4">
          <h2 className="mb-3 text-base font-bold">시간대별 접속</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s?.hourly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#00c2a8" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="gs-card p-4">
          <h2 className="mb-3 text-base font-bold">퀴즈 오답률 TOP 10</h2>
          <ol className="space-y-2">
            {(s?.quizWrongTop ?? []).map((q, i) => (
              <li key={q.productId} className="flex items-center gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gs-line text-xs font-bold text-gs-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{q.name}</span>
                <div className="h-2 w-24 shrink-0 overflow-hidden rounded-pill bg-gs-line">
                  <div
                    className="h-full rounded-pill bg-state-danger"
                    style={{ width: `${Math.min(100, q.wrongRate * 200)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-bold text-state-danger">
                  {(q.wrongRate * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  warn,
}: {
  icon: React.ElementType;
  label: string;
  value?: number;
  sub?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`gs-card p-4 ${accent ? 'border-gs-blue bg-gs-blue-light' : ''}`}>
      <Icon size={18} className={warn ? 'text-state-danger' : accent ? 'text-gs-blue' : 'text-gs-muted'} />
      <p className="mt-2 text-xs font-semibold text-gs-muted">{label}</p>
      <p className={`text-2xl font-black ${warn ? 'text-state-danger' : 'text-gs-ink'}`}>
        {value === undefined ? '—' : value.toLocaleString()}
      </p>
      {sub && <p className="text-xs text-gs-muted">{sub}</p>}
    </div>
  );
}
