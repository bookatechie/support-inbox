/**
 * Slash Command Extension for TipTap
 * Triggers canned response suggestions when typing "/"
 */

import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { CannedResponse } from '@/types';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { SlashCommandMenu, type SlashCommandMenuRef } from '@/components/SlashCommandMenu';

export interface SlashCommandOptions {
  getCannedResponses: () => CannedResponse[];
  onSelect: (response: CannedResponse) => void;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      getCannedResponses: () => [],
      onSelect: () => {},
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => {
          // Delete the "/" and any query text
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .run();

          // Call the onSelect callback with the selected response
          this.options.onSelect(props as CannedResponse);
        },
        items: ({ query }) => {
          // Get latest canned responses and filter based on query
          const cannedResponses = this.options.getCannedResponses();
          return cannedResponses
            .filter((response) => {
              return response.title.toLowerCase().includes(query.toLowerCase());
            })
            .slice(0, 10); // Limit to 10 results
        },
        render: () => {
          let component: ReactRenderer<SlashCommandMenuRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandMenu, {
                props: {
                  items: props.items,
                  command: props.command,
                },
                editor: props.editor,
              });

              if (!props.clientRect) {
                return;
              }

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                animation: 'shift-away',
                duration: [200, 150],
                offset: [0, 8],
                maxWidth: 'none',
              });
            },

            onUpdate(props) {
              component?.updateProps({
                items: props.items,
                command: props.command,
              });

              if (!props.clientRect) {
                return;
              }

              popup?.[0]?.setProps({
                getReferenceClientRect: props.clientRect as () => DOMRect,
              });
            },

            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide();
                return true;
              }

              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
