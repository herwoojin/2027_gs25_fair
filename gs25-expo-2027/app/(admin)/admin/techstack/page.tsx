'use client';

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';

interface TechItem {
  name: string;
  version?: string;
  purpose: string;
  config?: string;
}
interface TechStack {
  project: string;
  description: string;
  lastUpdated: string;
  repo: string;
  architectureSummary: string;
  categories: { name: string; items: TechItem[] }[];
}

/** 기술 스택 인벤토리 뷰어 — public/techstack.json 을 그대로 읽어 렌더링한다. */
export default function TechStackPage() {
  const [data, setData] = useState<TechStack | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/techstack.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="gs-card p-6 text-gs-muted">techstack.json 을 불러오지 못했습니다.</p>;
  if (!data) return <div className="gs-skeleton h-64 w-full" />;

  const total = data.categories.reduce((a, c) => a + c.items.length, 0);

  return (
    <div id="techStackBox" className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers size={22} className="text-gs-blue" /> 기술 스택
        </h1>
        <p className="text-sm text-gs-muted">
          {data.categories.length}개 카테고리 · {total}개 항목 · 마지막 업데이트 {data.lastUpdated}
        </p>
      </header>

      <section className="gs-card p-4">
        <h2 className="text-base font-bold">{data.project}</h2>
        <p className="mt-1 text-sm leading-relaxed text-gs-muted">{data.description}</p>
        <p className="mt-3 rounded-xl bg-gs-surface p-3 text-sm leading-relaxed">
          {data.architectureSummary}
        </p>
      </section>

      {data.categories.map((cat) => (
        <section key={cat.name} className="gs-card overflow-hidden">
          <h2 className="border-b border-gs-line bg-gs-surface px-4 py-2.5 text-base font-bold">
            {cat.name}
            <span className="ml-2 text-sm font-normal text-gs-muted">{cat.items.length}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-gs-muted">
                <tr className="border-b border-gs-line/70">
                  <th className="px-4 py-2 font-semibold">이름</th>
                  <th className="px-4 py-2 font-semibold">버전</th>
                  <th className="px-4 py-2 font-semibold">용도</th>
                  <th className="px-4 py-2 font-semibold">위치</th>
                </tr>
              </thead>
              <tbody>
                {cat.items.map((it) => (
                  <tr key={it.name} className="border-b border-gs-line/50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{it.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gs-muted">{it.version ?? '—'}</td>
                    <td className="px-4 py-2.5">{it.purpose}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gs-muted">{it.config ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-gs-muted">
        원본: <code>public/techstack.json</code> · 사람이 읽는 문서: <code>TECH_STACK.md</code>
      </p>
    </div>
  );
}
