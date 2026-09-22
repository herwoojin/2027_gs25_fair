'use client';

import { useRef, useState } from 'react';
import { Download } from 'lucide-react';

export interface CertificateData {
  storeName: string;
  storeCode: string;
  completionNo: number;
  completedAt: number;
  understanding: number;
}

/** T4-4 · 디지털 수료증 (워터마크 포함, 이미지로 저장 가능) */
export function Certificate({ data }: { data: CertificateData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = 720 * scale;
      canvas.height = 960 * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);

      // 배경
      const grad = ctx.createLinearGradient(0, 0, 720, 960);
      grad.addColorStop(0, '#0056b3');
      grad.addColorStop(1, '#00c2a8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 720, 960);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(36, 36, 648, 888);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#0056b3';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('2027 GS25 상품전략공유회', 360, 150);
      ctx.fillStyle = '#0f223e';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText('완 주 증', 360, 230);

      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#62748d';
      ctx.fillText('아래 점포는 온라인 전시 전 과정을 완주하였기에', 360, 330);
      ctx.fillText('이 증서를 드립니다.', 360, 362);

      ctx.fillStyle = '#0f223e';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText(data.storeName, 360, 460);

      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#62748d';
      ctx.fillText(`점포코드 ${data.storeCode}`, 360, 500);

      ctx.fillStyle = '#00c2a8';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(`전국 완주 ${data.completionNo}번째`, 360, 580);

      ctx.fillStyle = '#62748d';
      ctx.font = '20px sans-serif';
      ctx.fillText(`이해도 ${data.understanding}%`, 360, 620);
      ctx.fillText(
        new Date(data.completedAt).toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        360,
        660,
      );

      ctx.fillStyle = '#0f223e';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('GS리테일 상품기획부문', 360, 800);

      // 워터마크
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.translate(360, 480);
      ctx.rotate((-30 * Math.PI) / 180);
      ctx.font = 'bold 24px sans-serif';
      for (let y = -400; y < 400; y += 90) {
        for (let x = -400; x < 400; x += 320) {
          ctx.fillText(`${data.storeCode} · 완주증`, x, y);
        }
      }
      ctx.restore();

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `GS25_공유회_완주증_${data.storeCode}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-card bg-gradient-to-br from-gs-blue to-gs-mint p-1.5 shadow-lift"
      >
        <div className="relative rounded-[0.8rem] bg-white px-6 py-10 text-center">
          <p className="text-sm font-bold text-gs-blue">2027 GS25 상품전략공유회</p>
          <h3 className="mt-3 text-3xl font-black tracking-[0.3em] text-gs-ink">완주증</h3>
          <p className="mt-6 text-sm leading-relaxed text-gs-muted">
            아래 점포는 온라인 전시 전 과정을 완주하였기에
            <br />이 증서를 드립니다.
          </p>
          <p className="mt-6 text-2xl font-black text-gs-ink">{data.storeName}</p>
          <p className="text-sm text-gs-muted">점포코드 {data.storeCode}</p>
          <p className="mt-6 text-lg font-bold text-gs-mint-dark">
            전국 완주 {data.completionNo}번째
          </p>
          <p className="mt-1 text-sm text-gs-muted">이해도 {data.understanding}%</p>
          <p className="text-sm text-gs-muted">
            {new Date(data.completedAt).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="mt-8 font-bold text-gs-ink">GS리테일 상품기획부문</p>
        </div>
      </div>

      <button className="gs-btn-ghost w-full" onClick={save} disabled={busy}>
        <Download size={18} /> {busy ? '저장 중…' : '이미지로 저장'}
      </button>
    </div>
  );
}
