'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, X } from 'lucide-react';
import type { Cheer, RegionCode, WordCloudItem } from '@/types';
import { REGIONS } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { WordCloud } from '@/components/cheer/WordCloud';
import { useToast } from '@/components/common/Toast';

/** T5-6 / T5-7 · 지역별 응원 메시지 + 워드클라우드 */
export default function CheerPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [region, setRegion] = useState<RegionCode | 'ALL'>('ALL');
  const [word, setWord] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: cloud } = useQuery({
    queryKey: ['wordcloud', region],
    queryFn: () =>
      callFn<{ wordcloud: WordCloudItem[]; regionCounts: Record<string, number> }>('getAggregates', {
        kind: 'wordcloud',
        region,
      }),
    // 서버가 1분마다 집계하므로 동일 주기로 갱신한다.
    refetchInterval: 60_000,
  });

  const { data: feed } = useQuery({
    queryKey: ['cheers', region, word],
    queryFn: () =>
      callFn<{ cheers: Cheer[]; total: number }>('listCheers', {
        region,
        word: word ?? undefined,
        limit: 40,
      }),
    refetchInterval: 30_000,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await callFn<{ held: boolean }>('createCheer', { text: text.trim() });
      setText('');
      toast.push(
        res.held ? '검수 후 노출됩니다.' : '응원 메시지가 등록되었습니다. 고맙습니다!',
        'success',
      );
      await qc.invalidateQueries({ queryKey: ['cheers'] });
      await qc.invalidateQueries({ queryKey: ['wordcloud'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">지역별 응원 메시지</h1>
        <p className="mt-1 text-gs-muted">
          전국 경영주님들이 남긴 한마디를 모았습니다. 단어를 눌러 보세요.
        </p>
      </header>

      {/* 지역 탭 10개 (전국 + 9) */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button
          className={cn('gs-chip shrink-0', region === 'ALL' && 'gs-chip-on')}
          onClick={() => {
            setRegion('ALL');
            setWord(null);
          }}
        >
          전국
        </button>
        {REGIONS.map((r) => (
          <button
            key={r.code}
            className={cn('gs-chip shrink-0', region === r.code && 'gs-chip-on')}
            onClick={() => {
              setRegion(r.code);
              setWord(null);
            }}
          >
            {r.label}
            {cloud?.regionCounts?.[r.code] ? (
              <span className="ml-1 text-xs opacity-70">{cloud.regionCounts[r.code]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="gs-card overflow-hidden p-2">
        <WordCloud items={cloud?.wordcloud ?? []} selected={word} onSelect={setWord} />
      </div>

      {word && (
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-pill bg-gs-blue px-3 py-1.5 text-sm font-bold text-white">
            “{word}” 포함 메시지
          </span>
          <button
            onClick={() => setWord(null)}
            className="flex min-h-[2.25rem] items-center gap-1 rounded-pill px-2 text-sm text-gs-muted"
          >
            <X size={14} /> 해제
          </button>
        </div>
      )}

      {/* 작성 */}
      <form onSubmit={submit} className="gs-card mt-4 p-4">
        <label className="block">
          <span className="mb-2 block text-base font-semibold">응원 한마디 (50자)</span>
          <div className="flex gap-2">
            <input
              className="gs-input flex-1"
              maxLength={50}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="함께 만드는 2027, 응원합니다!"
              required
            />
            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gs-blue text-white disabled:opacity-40"
              disabled={text.trim().length < 2 || busy}
              aria-label="등록"
            >
              <Send size={18} />
            </button>
          </div>
        </label>
        <p className="mt-2 text-right text-xs text-gs-muted">{text.length}/50</p>
      </form>

      {/* 목록 */}
      <ul className="mt-4 space-y-2">
        {(feed?.cheers ?? []).map((c) => (
          <li key={c.id} className="gs-card flex items-start gap-3 p-3.5">
            <span className="shrink-0 rounded-pill bg-gs-blue-light px-2.5 py-1 text-xs font-bold text-gs-blue">
              {REGIONS.find((r) => r.code === c.region)?.short ?? c.region}
            </span>
            <p className="flex-1 text-base leading-relaxed">{c.text}</p>
            <span className="shrink-0 text-xs text-gs-muted">{relativeTime(c.createdAt)}</span>
          </li>
        ))}
        {feed?.cheers.length === 0 && (
          <li className="gs-card p-6 text-center text-gs-muted">
            {word ? `“${word}”이(가) 포함된 메시지가 없습니다.` : '아직 응원 메시지가 없습니다.'}
          </li>
        )}
      </ul>
    </div>
  );
}
