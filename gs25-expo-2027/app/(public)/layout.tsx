import { ToastProvider } from '@/components/common/Toast';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
