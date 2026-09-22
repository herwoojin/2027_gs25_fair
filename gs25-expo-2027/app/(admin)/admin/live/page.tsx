'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Save } from 'lucide-react';
import type { LiveStream } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { cn, formatDateKo } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

type Row = LiveStream & { subscribed: boolean; youtubeId: string | null };

/** T7-4 · 관리자 라이브 편성 관리 */
export default function AdminLivePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ['live'],
    queryFn: () => callFn<{ streams: Row[] }>('getLive'),
  });

  const save = async (id: string) => {
    try {
      await callFn('setLiveYoutubeId', { streamId: id, youtubeId: (drafts[id] ?? '').trim() });
      toast.push('저장했습니다. 로그인 사용자 화면에 바로 반영됩니다.', 'success');
      await qc.invalidateQueries({ queryKey: ['live'] });
    } catch (err) {
      toast.push((err as ApiError).message, 'error');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold">라이브 편성 관리</h1>
        <p className="text-sm text-gs-muted">
          YouTube <b>일부공개</b> 영상 ID를 입력하면 로그인 사용자 화면에만 플레이어가 노출됩니다.
        </p>
      </header>

      <ul className="space-y-2">
        {(data?.streams ?? []).map((s) => (
          <li key={s.id} className="gs-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-pill px-2.5 py-0.5 text-xs font-bold text-white',
                  s.status === 'live' ? 'bg-state-critical' : s.status === 'ended' ? 'bg-gs-muted' : 'bg-gs-blue',
                )}
              >
                {s.status === 'live' ? 'LIVE' : s.status === 'ended' ? '종료' : '예정'}
              </span>
              <span className="font-bold">{s.city}</span>
              <span className="text-sm text-gs-muted">{formatDateKo(s.startAt, true)}</span>
              <span className="text-sm text-gs-muted">· {s.mdName} MD</span>
            </div>
            <p className="mt-1.5 text-base">{s.topic}</p>
            <div className="mt-3 flex gap-2">
              <input
                className="gs-input flex-1 text-sm"
                placeholder="YouTube 영상 ID (예: dQw4w9WgXcQ)"
                defaultValue={s.youtubeId ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
              />
              <button className="gs-btn-primary h-11 min-h-0 shrink-0 px-4 text-sm" onClick={() => save(s.id)}>
                <Save size={15} /> 저장
              </button>
            </div>
          </li>
        ))}
        {(data?.streams.length ?? 0) === 0 && (
          <li className="gs-card p-8 text-center text-gs-muted">
            <Radio className="mx-auto mb-2" size={22} />
            등록된 편성이 없습니다.
          </li>
        )}
      </ul>

      <section className="gs-card p-4 text-sm text-gs-muted">
        <h2 className="mb-2 text-base font-bold text-gs-ink">방송 전 체크리스트 (GUIDE 7장)</h2>
        <ul className="space-y-1">
          <li>· 일부공개 설정 · 퍼가기 허용 · YouTube 채팅 끔(자체 채팅 사용)</li>
          <li>· 발언 금지: 원가 · 마진율 · 공급사 조건 · 미확정 출시일 · 타사 비교</li>
          <li>· 현장 업로드 속도 10Mbps 이상 확인, 예비 스마트폰·에그 준비</li>
          <li>· 종료 후 30분 내 다시보기 등록(민감 발언 구간은 편집 후 공개)</li>
        </ul>
      </section>
    </div>
  );
}
