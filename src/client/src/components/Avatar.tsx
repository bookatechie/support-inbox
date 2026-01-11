/**
 * Avatar component with deterministic color assignment
 * Based on Chatwoot's avatar implementation
 */

import { useMemo } from 'react';

interface AvatarProps {
  name: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Color palette - deterministic colors based on name
const AVATAR_COLORS = [
  { bg: 'bg-pink-100 dark:bg-pink-900', text: 'text-pink-700 dark:text-pink-200' },
  { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-700 dark:text-orange-200' },
  { bg: 'bg-slate-200 dark:bg-slate-700', text: 'text-slate-700 dark:text-slate-200' },
  { bg: 'bg-teal-100 dark:bg-teal-900', text: 'text-teal-700 dark:text-teal-200' },
  { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-700 dark:text-purple-200' },
  { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-200' },
] as const;

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
} as const;

/**
 * Get initials from name
 * Examples: "John Doe" → "JD", "John" → "J", "john@example.com" → "J"
 */
function getInitials(name: string): string {
  if (!name) return '?';

  // Remove emoji and trim
  const cleanName = name.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

  // Split by whitespace
  const words = cleanName.split(/\s+/);

  if (words.length === 1) {
    // Single word - take first character
    return words[0].charAt(0).toUpperCase();
  }

  // Multiple words - take first character of first two words
  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * Get deterministic color based on identifier (name or email)
 * Same identifier always gets the same color
 */
function getAvatarColor(identifier: string): typeof AVATAR_COLORS[number] {
  if (!identifier) return AVATAR_COLORS[0];

  // Use identifier length to pick color (simple and deterministic)
  const index = identifier.length % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

export function Avatar({ name, email, size = 'md', className = '' }: AvatarProps) {
  // Use the same identifier for both initials and color to ensure consistency
  const identifier = name || email || '';
  const initials = useMemo(() => getInitials(identifier), [identifier]);
  const colors = useMemo(() => getAvatarColor(identifier), [identifier]);

  return (
    <div
      className={`
        ${SIZE_CLASSES[size]}
        ${colors.bg}
        ${colors.text}
        ${className}
        rounded-full flex items-center justify-center font-semibold
      `.trim()}
      title={name || email}
    >
      {initials}
    </div>
  );
}
