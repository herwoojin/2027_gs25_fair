'use client';

import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { SessionProvider } from '@/lib/hooks/useSession';
import { initAppCheck } from '@/lib/appCheck';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // TRD 5장 — 콘텐츠는 1회 로드 후 메모리 캐시로 반복 읽기를 줄인다.
            staleTime: 10 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    initAppCheck();
  }, []);

  return (
    <QueryClientProvider client={client}>
      {/*
        reducedMotion="user" — 사용자의 '동작 줄이기' 설정을 framer-motion 이 내부에서 처리한다.
        컴포넌트에서 useReducedMotion() 으로 렌더를 분기하면 SSR(false)과
        하이드레이션(실제값)이 어긋나 React #418/#423 이 발생하므로 쓰지 않는다.
      */}
      <MotionConfig reducedMotion="user">
        <SessionProvider>{children}</SessionProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
