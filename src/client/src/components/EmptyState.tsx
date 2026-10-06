import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

// Shared "nothing here" card for lists, so every page says it the same way
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {Icon && <Icon className="h-8 w-8 text-muted-foreground/60 mb-1" />}
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
