'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Lock, ShieldCheck, Unlock } from 'lucide-react';
import { AUDIENCE_LABEL, EXTERNAL_NODES, SITE_MAP, countPages, type Audience, type SiteNode } from '@/lib/siteMap';
import { BrandMark } from '@/components/common/AppShell';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { cn } from '@/lib/utils';

/**
 * 사이트맵 — 이 웹앱이 어떤 화면으로 이루어져 있는지 한 장에 보여 준다.
 *
 * 단순 링크 목록이 아니라 **접근 경계**를 같이 보여 주는 게 핵심이다.
 * "이 화면은 누가 볼 수 있나"가 이 플랫폼에서 가장 자주 나오는 질문이다.
 */

const TONE: Record<Audience, { icon: typeof Lock; chip: string; bar: string }> = {
  public: { icon: Unlock, chip: 'bg-gs-mint-light text-gs-mint-dark', bar: 'bg-gs-mint' },
  owner: { icon: Lock, chip: 'bg-gs-blue-light text-gs-blue', bar: 'bg-gs-blue' },
  staff: { icon: ShieldCheck, chip: 'bg-gs-sand text-gs-ink', bar: 'bg-gs-ink' },
};

export default function SiteMapPage() {
  return (
    <div className="min-h-dvh bg-gs-bg text-gs-ink">
      <header className="sticky top-0 z-20 border-b border-gs-line bg-gs-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark compact />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-pill border border-gs-line px-3.5 py-2 text-sm font-semibold text-gs-muted transition hover:bg-gs-surface"
            >
              <ArrowLeft size={15} /> 처음으로
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl font-black sm:text-4xl">사이트맵</h1>
        <p className="mt-2 leading-relaxed text-gs-muted">
          2027 GS25 상품전략공유회는 <b className="text-gs-ink">{countPages()}개 화면</b>으로 이루어져
          있습니다. 화면마다 볼 수 있는 분이 달라, 아래에 접근 범위를 함께 적었습니다.
        </p>

        <div className="mt-9 space-y-9">
          {SITE_MAP.map((group) => {
            const tone = TONE[group.audience];
            const Icon = tone.icon;
            return (
              <section key={group.audience}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-bold', tone.chip)}>
                    <Icon size={14} /> {AUDIENCE_LABEL[group.audience]}
                  </span>
                  <h2 className="text-xl font-bold">{group.title}</h2>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-gs-muted">{group.access}</p>

                <ul className="mt-4 space-y-2">
                  {group.nodes.map((n) => (
                    <NodeRow key={n.path} node={n} bar={tone.bar} />
                  ))}
                </ul>
              </section>
            );
          })}

          {/* 외부 앱 */}
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-gs-surface px-3 py-1 text-sm font-bold text-gs-muted">
                <ExternalLink size={14} /> 별도 앱
              </span>
              <h2 className="text-xl font-bold">이 저장소 밖</h2>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-gs-muted">
              같은 동선에 속하지만 별도로 배포되는 화면입니다.
            </p>
            <ul className="mt-4 space-y-2">
              {EXTERNAL_NODES.map((e) => (
                <li key={e.label} className="gs-card flex gap-3 p-4">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gs-muted" />
                  <div className="min-w-0">
                    <p className="font-bold">{e.label}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-gs-muted">{e.desc}</p>
                    <p className="mt-1 font-mono text-xs text-gs-muted">{e.envKey}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="mt-10 rounded-xl bg-gs-surface px-4 py-3 text-sm leading-relaxed text-gs-muted">
          로그인이 필요한 화면은 지금 눌러도 로그인 화면으로 이동합니다. 접근 권한은 점포
          화이트리스트와 본부 계정으로 관리됩니다.
        </p>
      </main>
    </div>
  );
}

function NodeRow({ node, bar, depth = 0 }: { node: SiteNode; bar: string; depth?: number }) {
  const body = (
    <>
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', bar)} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="font-bold">{node.label}</span>
          <span className="font-mono text-xs text-gs-muted">{node.path}</span>
        </span>
        <span className="mt-0.5 block text-sm leading-relaxed text-gs-muted">{node.desc}</span>
      </span>
    </>
  );

  return (
    <li className={cn(depth > 0 && 'ml-6')}>
      {node.dynamic ? (
        // [zoneId] 처럼 값이 필요한 경로는 링크를 걸 수 없다
        <div className="gs-card flex gap-3 p-4">{body}</div>
      ) : (
        <Link href={node.path} className="gs-card flex gap-3 p-4 transition hover:border-gs-blue hover:shadow-card">
          {body}
        </Link>
      )}
      {node.children && (
        <ul className="mt-2 space-y-2">
          {node.children.map((c) => (
            <NodeRow key={c.path} node={c} bar={bar} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
