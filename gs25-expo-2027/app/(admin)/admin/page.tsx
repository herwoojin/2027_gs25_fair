'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/hooks/useSession';

export default function AdminIndexPage() {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    router.replace(user?.role === 'operator' ? '/admin/reservations' : '/admin/dashboard');
  }, [user, loading, router]);

  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gs-line border-t-gs-blue" />
    </div>
  );
}
