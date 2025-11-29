/**
 * Reusable back button component
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BackButtonProps {
  to: string;
  className?: string;
}

export function BackButton({ to, className = '' }: BackButtonProps) {
  return (
    <Link to={to} className={`flex items-center ${className}`}>
      <Button variant="ghost" size="icon" className="rounded-full">
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </Link>
  );
}
