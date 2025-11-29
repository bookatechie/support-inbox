/**
 * Selectable Avatar component
 * Uses avatar as a selection target with checkmark overlay
 */

import { Check } from 'lucide-react';
import { Avatar } from './Avatar';
import { cn } from '@/lib/utils';

interface SelectableAvatarProps {
  name: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function SelectableAvatar({
  name,
  email,
  size = 'md',
  selected = false,
  onClick,
  className = '',
}: SelectableAvatarProps) {
  return (
    <div
      className={cn(
        'relative cursor-pointer group',
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Select ${name || email}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e as any);
        }
      }}
    >
      {/* Avatar */}
      <Avatar name={name} email={email} size={size} />

      {/* Hover indicator */}
      {!selected && (
        <div className="absolute inset-0 rounded-full bg-muted-foreground/0 group-hover:bg-muted-foreground/10 transition-colors duration-200" />
      )}

      {/* Checkmark Overlay - covers entire avatar */}
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary rounded-full animate-in fade-in zoom-in duration-200">
          <Check className="h-5 w-5 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
