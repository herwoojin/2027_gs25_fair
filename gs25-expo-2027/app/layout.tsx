import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ServerBattery } from '@/components/common/ServerBattery';

export const metadata: Metadata = {
  title: '2027 GS25 상품전략공유회',
  // S-08 · 링크 미리보기에 상품 정보를 노출하지 않는다.
  description: '등록된 경영주님만 입장할 수 있는 폐쇄형 온라인 전시입니다.',
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: '2027 GS25 상품전략공유회',
    description: '등록된 경영주님만 입장할 수 있습니다.',
  },
  manifest: '/manifest.json',
  applicationName: 'GS25 공유회',
  appleWebApp: { capable: true, title: 'GS25 공유회', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0056b3',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
        <ServerBattery />
      </body>
    </html>
  );
}
