'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CloudOff, Keyboard, QrCode, RefreshCw } from 'lucide-react';
import { callFn, type ApiError } from '@/lib/api';
import { SOUVENIR_CHECKLIST } from '@/lib/souvenirChecklist';
import { safeStorage } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

interface CheckInResult {
  storeName: string;
  engravingText: string;
  reservation: { id: string; slotNo: number; date: string };
}

const QUEUE_KEY = 'gs25expo.checkinQueue';

/**
 * T7-3 · 운영자 체크인 (모바일 전용 UI).
 * QR 스캔 → 서버 검증(당일·해당 타임·중복 거부) → 기념품 지급 체크 → 재고 차감.
 * 네트워크가 끊기면 로컬 큐에 저장했다가 복구되면 재전송한다.
 */
export default function CheckInPage() {
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [queue, setQueue] = useState<{ qrToken: string; souvenirIds: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);

  useEffect(() => {
    try {
      setQueue(JSON.parse(safeStorage.get(QUEUE_KEY) ?? '[]'));
    } catch {
      setQueue([]);
    }
  }, []);

  const saveQueue = (next: { qrToken: string; souvenirIds: string[] }[]) => {
    setQueue(next);
    safeStorage.set(QUEUE_KEY, JSON.stringify(next));
  };

  const doCheckIn = useCallback(
    async (qrToken: string, souvenirIds: string[]) => {
      setBusy(true);
      try {
        const res = await callFn<CheckInResult>('checkIn', { qrToken, souvenirIds });
        setResult(res);
        toast.push(`${res.storeName} 체크인 완료`, 'success');
        try {
          navigator.vibrate?.(60);
        } catch {
          /* noop */
        }
        return true;
      } catch (err) {
        const e = err as ApiError;
        if (e.status >= 500 || e.code === 'internal' || !navigator.onLine) {
          // 네트워크·서버 장애 → 로컬 큐 보관
          const next = [...queue, { qrToken, souvenirIds }];
          saveQueue(next);
          toast.push('오프라인 큐에 저장했습니다. 복구되면 자동 전송됩니다.', 'info');
        } else {
          toast.push(e.message, 'error');
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [queue, toast],
  );

  const flushQueue = useCallback(async () => {
    if (queue.length === 0) return;
    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        await callFn('checkIn', item);
      } catch {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    toast.push(
      remaining.length === 0 ? '대기 중이던 체크인을 모두 전송했습니다.' : `${remaining.length}건이 남았습니다.`,
      remaining.length === 0 ? 'success' : 'info',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, toast]);

  useEffect(() => {
    const on = () => void flushQueue();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flushQueue]);

  const startScan = async () => {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          await scanner.stop();
          setScanning(false);
          await doCheckIn(decoded, picked);
        },
        () => {},
      );
    } catch {
      setScanning(false);
      toast.push('카메라를 열 수 없습니다. 수동 입력을 사용해 주세요.', 'error');
    }
  };

  const stopScan = async () => {
    try {
      await scannerRef.current?.stop();
    } catch {
      /* noop */
    }
    setScanning(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-10">
      <header>
        <h1 className="text-2xl font-bold">현장 체크인</h1>
        <p className="text-sm text-gs-muted">QR을 스캔하면 예약·타임을 확인하고 기념품을 지급 처리합니다.</p>
      </header>

      {queue.length > 0 && (
        <div className="gs-card flex items-center gap-3 border-state-danger bg-amber-50 p-3">
          <CloudOff size={20} className="text-state-danger" />
          <p className="flex-1 text-sm font-semibold">전송 대기 {queue.length}건</p>
          <button className="gs-btn-ghost h-9 min-h-0 text-sm" onClick={flushQueue}>
            <RefreshCw size={14} /> 재전송
          </button>
        </div>
      )}

      {/* 기념품 체크 */}
      <section className="gs-card p-4">
        <h2 className="mb-2 text-base font-bold">지급할 기념품</h2>
        <div className="grid grid-cols-2 gap-2">
          {SOUVENIR_CHECKLIST.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                className={`flex min-h-[3rem] items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition ${
                  on ? 'border-gs-mint bg-gs-mint/15 text-gs-mint-dark' : 'border-gs-line text-gs-muted'
                }`}
              >
                {on ? <Check size={16} /> : <span className="h-4 w-4 rounded border-2 border-current" />}
                {s.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* 스캐너 */}
      <section className="gs-card overflow-hidden p-4">
        <div id="qr-reader" className={scanning ? 'mb-3 overflow-hidden rounded-xl' : 'hidden'} />
        {scanning ? (
          <button className="gs-btn-ghost w-full" onClick={stopScan}>
            스캔 중지
          </button>
        ) : (
          <button className="gs-btn-primary w-full" onClick={startScan} disabled={busy}>
            <QrCode size={18} /> QR 스캔 시작
          </button>
        )}

        <div className="mt-3 flex gap-2">
          <input
            className="gs-input flex-1 text-sm"
            placeholder="QR 토큰 직접 입력"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <button
            className="gs-btn-ghost h-11 min-h-0 shrink-0 px-3 text-sm"
            disabled={!manual.trim() || busy}
            onClick={async () => {
              const ok = await doCheckIn(manual.trim(), picked);
              if (ok) setManual('');
            }}
          >
            <Keyboard size={15} /> 확인
          </button>
        </div>
      </section>

      {result && (
        <section className="gs-card border-gs-mint bg-gs-mint/10 p-5 text-center">
          <Check className="mx-auto mb-2 text-gs-mint-dark" size={34} />
          <p className="text-2xl font-bold">{result.storeName}</p>
          {result.engravingText && (
            <p className="mt-2 rounded-xl bg-white px-4 py-3 text-lg">
              각인 문구 <b>{result.engravingText}</b>
            </p>
          )}
          <p className="mt-2 text-sm text-gs-muted">
            지급: {picked.length ? picked.map((p) => SOUVENIR_CHECKLIST.find((s) => s.id === p)?.name).join(', ') : '없음'}
          </p>
          <button className="gs-btn-ghost mt-3 w-full" onClick={() => setResult(null)}>
            다음 손님
          </button>
        </section>
      )}
    </div>
  );
}
