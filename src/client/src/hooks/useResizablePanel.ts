import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';

interface ResizablePanelOptions {
  /** localStorage key the width is saved under */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface ResizablePanel {
  width: number;
  isResizing: boolean;
  /** Attach to the drag handle on the panel's left edge */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}

const KEYBOARD_STEP = 16;

/**
 * Width state for a right-hand side panel that the user resizes by dragging its left edge.
 * The width is persisted to localStorage; double-clicking the handle resets it.
 */
export function useResizablePanel({ storageKey, defaultWidth, minWidth, maxWidth }: ResizablePanelOptions): ResizablePanel {
  const clamp = useCallback(
    (value: number): number => Math.min(maxWidth, Math.max(minWidth, value)),
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
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      // Ignore storage failures
    }
  }, [storageKey, width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: PointerEvent) => {
      if (!dragStart.current) return;
      // Handle sits on the left edge, so dragging left widens the panel
      setWidth(clamp(dragStart.current.width + dragStart.current.x - e.clientX));
    };
    const handleUp = () => {
      dragStart.current = null;
      setIsResizing(false);
    };

    // Keep the resize cursor and stop text selection while dragging across the page
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isResizing, clamp]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragStart.current = { x: e.clientX, width };
      setIsResizing(true);
    },
    [width]
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

  return { width, isResizing, handleProps: { onPointerDown, onDoubleClick, onKeyDown } };
}
