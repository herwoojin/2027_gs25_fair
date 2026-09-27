'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import type { LiveStream } from '@/types';
import { callFn, type ApiError } from '@/lib/api';
import { EVENTS } from '@/lib/seed/events';
import { formatDateKo } from '@/lib/utils';

/** datetime-local 용 문자열(KST). Intl 을 쓰지 않아 런타임에 무관하게 같은 값이 나온다. */
function toLocalInput(ts: number): string {
  const d = new Date(ts + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
/** 입력값(KST)을 epoch 로 */
function fromLocalInput(v: string): number {
  return Date.parse(`${v}:00+09:00`);
}

type Draft = Omit<LiveStream, 'id' | 'status'> & { id?: string };

const blank = (): Draft => ({
  eventId: EVENTS[0].id,
  city: EVENTS[0].city,
  startAt: Date.now() + 3600_000,
  endAt: Date.now() + 5400_000,
  mdName: '',
  topic: '',
  youtubeId: '',
});

export default function AdminLivePage() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await callFn<{ streams: LiveStream[] }>('adminLiveList');
      setStreams(r.streams);
    } catch (e) {
      setError((e as ApiError).message ?? '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const r = await callFn<{ streams: LiveStream[] }>('adminLiveSave', {
        ...draft,
        youtubeId: draft.youtubeId?.trim() || undefined,
      });
      setStreams(r.streams);
      setDraft(null);
    } catch (e) {
      setError((e as ApiError).message ?? '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, topic: string) => {
    if (!window.confirm(`"${topic}" 편성을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    setError('');
    try {
      const r = await callFn<{ streams: LiveStream[] }>('adminLiveDelete', { id });
      setStreams(r.streams);
    } catch (e) {
      setError((e as ApiError).message ?? '삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="px-4 py-4 sm:px-6 lg:ml-56">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">라이브 편성 관리</h1>
            <p className="text-sm text-gs-muted">
              편성을 직접 추가·수정·삭제합니다. YouTube <b>일부공개</b> 영상 ID를 넣으면 로그인
              사용자 화면에만 플레이어가 노출됩니다.
            </p>
          </div>
          <button className="gs-btn-primary h-11 min-h-0 px-4 text-sm" onClick={() => setDraft(blank())}>
            <Plus size={15} /> 편성 추가
          </button>
        </header>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-state-critical">{error}</p>
        )}

        {draft && (
          <section className="gs-card space-y-3 border-2 border-gs-blue p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{draft.id ? '편성 수정' : '새 편성'}</h2>
              <button aria-label="닫기" onClick={() => setDraft(null)} className="text-gs-muted">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs font-bold text-gs-muted">도시</span>
                <select
                  className="gs-input mt-1 w-full text-sm"
                  value={draft.eventId}
                  onChange={(e) => {
                    const ev = EVENTS.find((x) => x.id === e.target.value)!;
                    setDraft({ ...draft, eventId: ev.id, city: ev.city });
                  }}
                >
                  {EVENTS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.city}
                    </option>
                  ))}
                </select>
              </label>
              <Text label="진행 MD" value={draft.mdName} onChange={(v) => setDraft({ ...draft, mdName: v })} />
              <label className="block">
                <span className="block text-xs font-bold text-gs-muted">시작</span>
                <input
                  type="datetime-local"
                  className="gs-input mt-1 w-full text-sm"
                  value={toLocalInput(draft.startAt)}
                  onChange={(e) => setDraft({ ...draft, startAt: fromLocalInput(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gs-muted">종료</span>
                <input
                  type="datetime-local"
                  className="gs-input mt-1 w-full text-sm"
                  value={toLocalInput(draft.endAt)}
                  onChange={(e) => setDraft({ ...draft, endAt: fromLocalInput(e.target.value) })}
                />
              </label>
            </div>
            <Text label="주제" value={draft.topic} onChange={(v) => setDraft({ ...draft, topic: v })} />
            <Text
              label="YouTube 영상 ID (선택)"
              value={draft.youtubeId ?? ''}
              onChange={(v) => setDraft({ ...draft, youtubeId: v })}
              placeholder="dQw4w9WgXcQ"
            />
            <button
              className="gs-btn-primary h-11 min-h-0 px-4 text-sm disabled:opacity-40"
              onClick={save}
              disabled={busy || !draft.mdName.trim() || !draft.topic.trim()}
            >
              <Save size={15} /> 저장
            </button>
          </section>
        )}

        {streams.length === 0 && !draft && (
          <p className="gs-card p-6 text-center text-sm text-gs-muted">
            등록된 편성이 없습니다. <b>편성 추가</b>로 시작하세요.
          </p>
        )}

        <ul className="space-y-2">
          {streams.map((s) => (
            <li key={s.id} className="gs-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill bg-gs-blue px-2.5 py-0.5 text-xs font-bold text-white">
                  {s.status === 'live' ? '진행중' : s.status === 'ended' ? '종료' : '예정'}
                </span>
                <span className="font-bold">{s.city}</span>
                <span className="text-sm text-gs-muted">{formatDateKo(s.startAt, true)}</span>
                <span className="text-sm text-gs-muted">· {s.mdName}</span>
                {s.youtubeId && (
                  <span className="rounded-pill bg-gs-mint-light px-2 py-0.5 text-xs font-bold text-gs-mint-dark">
                    영상 연결됨
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-base">{s.topic}</p>
              <div className="mt-3 flex gap-2">
                <button
                  className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm"
                  onClick={() => setDraft({ ...s })}
                >
                  수정
                </button>
                <button
                  className="gs-btn h-10 min-h-0 border border-gs-line px-3 text-sm text-state-critical"
                  onClick={() => remove(s.id, s.topic)}
                  disabled={busy}
                >
                  <Trash2 size={14} /> 삭제
                </button>
              </div>
            </li>
          ))}
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
    </main>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gs-muted">{label}</span>
      <input
        className="gs-input mt-1 w-full text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
