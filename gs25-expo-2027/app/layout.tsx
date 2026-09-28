import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ServerBattery } from '@/components/common/ServerBattery';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/hooks/useTheme';
import { ServiceWorker } from '@/components/common/ServiceWorker';

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
  appleWebApp: {
    capable: true,
    title: 'GS25 공유회',
    // 'default' 는 상태바가 흰 배경에 검은 글씨다. 어두운 모드로 들어가면 글자가 묻혀
    // 'black-translucent' 로 두고, 콘텐츠는 safe-area 로 피한다.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // appleWebApp 은 apple- 접두사 meta 만 만든다. 표준 이름도 함께 넣어야
  // 크롬의 deprecation 경고가 사라지고 안드로이드 홈화면 추가가 정상 동작한다.
  other: { 'mobile-web-app-capable': 'yes' },
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
    // suppressHydrationWarning — 브라우저 확장프로그램(번역·비밀번호 관리자·광고 차단 등)이
    // 하이드레이션 전에 html/body 에 속성을 주입하면 React #418/#423/#425 가 발생한다.
    // 앱이 만든 마크업이 아니므로 최상위 두 요소에서만 경고를 억제한다.
    // (하위 컴포넌트의 실제 불일치는 그대로 잡힌다)
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 보기 모드를 첫 페인트 전에 적용한다 — 흰 화면이 번쩍이지 않게 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
        <ServerBattery />
        <ServiceWorker />
      </body>
    </html>
  );
}
