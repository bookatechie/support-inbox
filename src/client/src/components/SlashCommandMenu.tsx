/**
 * Slash Command Menu Component
 * Displays filtered canned responses when typing "/"
 */

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { CannedResponse } from '@/types';
import { Card } from '@/components/ui/card';

export interface SlashCommandMenuProps {
  items: CannedResponse[];
  command: (item: CannedResponse) => void;
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }

        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }

        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    if (props.items.length === 0) {
      return (
        <div className="bg-background border rounded-lg shadow-xl p-3 min-w-[280px]">
          <div className="text-sm text-muted-foreground">No templates found</div>
        </div>
      );
    }

    return (
      <div className="bg-background border rounded-lg shadow-xl py-2 min-w-[320px] max-h-[400px] overflow-y-auto">
        <div className="px-3 py-1 mb-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Templates
          </div>
        </div>
        {props.items.map((item, index) => (
          <button
            key={item.id}
            className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
              index === selectedIndex
                ? 'bg-accent border-l-primary'
                : 'border-l-transparent hover:bg-accent/50'
            }`}
            onClick={() => selectItem(index)}
            type="button"
          >
            <div className="font-medium text-sm">{item.title}</div>
          </button>
        ))}
      </div>
    );
  }
);

SlashCommandMenu.displayName = 'SlashCommandMenu';
