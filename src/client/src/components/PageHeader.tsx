/**
 * Inner layout of a page's top bar, shared by the secondary pages (search, calendar, reports,
 * users, routing rules, canned responses): back button, icon, title with an optional subtitle,
 * and actions on the right. Extra rows (e.g. a filter bar) go in children, below the title row.
 * Use inside AppHeader.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Where the back button goes (default: the inbox) */
  backTo?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, backTo = '/tickets', actions, children }: PageHeaderProps) {
  return (
    <>
      <div className="container mx-auto px-2 sm:px-4 py-3">
        <div className="flex items-center gap-2 sm:gap-3 min-h-10">
          <BackButton to={backTo} />
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-xl font-semibold leading-tight truncate">{title}</h1>
            {subtitle && <p className="hidden sm:block text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      </div>
      {children}
    </>
  );
}
