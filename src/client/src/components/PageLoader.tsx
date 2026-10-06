/**
 * Loading state for a page's content area. Pages render their header as usual and put this
 * below it, so the header (title, back button) stays put while data loads.
 */
import { Loader2 } from 'lucide-react';

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="text-sm">{label ?? 'Loading…'}</span>
    </div>
  );
}
