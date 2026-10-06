/**
 * The sticky top bar used on every page: same tint, translucency and blur everywhere,
 * so headers can't drift apart page by page. Pages put their own content inside.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AppHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <header className={cn('sticky top-0 z-50 border-b backdrop-blur-lg bg-header/70', className)}>
      {children}
    </header>
  );
}
