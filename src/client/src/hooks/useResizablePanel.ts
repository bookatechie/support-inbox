import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';

interface ResizablePanelOptions {
  /** localStorage key the width is saved under */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface ResizablePanel<T extends HTMLElement> {
  /** Attach to the panel whose width is controlled */
  panelRef: React.RefObject<T | null>;
  width: number;
  isResizing: boolean;
  /** Attach to the drag handle on the panel's left edge */
  handleProps: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

const KEYBOARD_STEP = 16;

/**
 * Width state for a right-hand side panel that the user resizes by dragging its left edge.
 * Same approach as the composer resize: pointer capture keeps every move (and the release) on
 * the handle even when the cursor is over an email iframe, and the panel's DOM width is set
 * directly while dragging so the page doesn't re-render on every move. The width is committed
 * to state and localStorage on release; double-clicking the handle resets it.
 */
export function useResizablePanel<T extends HTMLElement = HTMLDivElement>({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: ResizablePanelOptions): ResizablePanel<T> {
  const panelRef = useRef<T | null>(null);
  const clamp = useCallback(
    (value: number): number => Math.round(Math.min(maxWidth, Math.max(minWidth, value))),
    [minWidth, maxWidth]
  );

  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved) return clamp(saved);
    } catch {
      // Storage unavailable; fall back to the default
    }
    return defaultWidth;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // Ignore storage failures
    }
  }, [storageKey, width]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = panelRef.current?.offsetWidth ?? width;
      let finalWidth = startWidth;
      let ended = false;

      // Keep the resize cursor everywhere while dragging
      const previousCursor = document.body.style.cursor;
      document.body.style.cursor = 'col-resize';

      const handleMove = (moveEvent: PointerEvent) => {
        // Handle sits on the left edge, so dragging left widens the panel
        finalWidth = clamp(startWidth + startX - moveEvent.clientX);
        if (panelRef.current) {
          panelRef.current.style.width = `${finalWidth}px`;
        }
      };

      const handleEnd = () => {
        if (ended) return;
        ended = true;
        handle.removeEventListener('pointermove', handleMove);
        handle.removeEventListener('pointerup', handleEnd);
        handle.removeEventListener('pointercancel', handleEnd);
        handle.removeEventListener('lostpointercapture', handleEnd);
        document.body.style.cursor = previousCursor;
        setIsResizing(false);
        setWidth(finalWidth);
      };

      handle.addEventListener('pointermove', handleMove);
      handle.addEventListener('pointerup', handleEnd);
      handle.addEventListener('pointercancel', handleEnd);
      handle.addEventListener('lostpointercapture', handleEnd);
    },
    [width, clamp]
  );

  const onDoubleClick = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWidth((w) => clamp(w + KEYBOARD_STEP));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWidth((w) => clamp(w - KEYBOARD_STEP));
      }
    },
    [clamp]
  );

  return { panelRef, width, isResizing, handleProps: { onPointerDown, onDoubleClick, onKeyDown } };
}
