import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/lib/request';
import type { Tag } from '@/types';

// All tags, cached for every page (creating a tag invalidates ['tags'])
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => request<Tag[]>('/tags'),
    staleTime: 5 * 60 * 1000,
  });
}

// Get tags for a specific ticket
export function useTicketTags(ticketId: number) {
  return useQuery({
    queryKey: ['tickets', ticketId, 'tags'],
    queryFn: () => request<Tag[]>(`/tickets/${ticketId}/tags`),
    enabled: !!ticketId,
  });
}

// Create new tag
export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string }) =>
      request<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });

      // Clear sessionStorage cache for tags
      sessionStorage.removeItem('support-inbox-tags-cache');
      sessionStorage.removeItem('support-inbox-tags-cache-timestamp');
    },
  });
}

// Add tag to ticket
export function useAddTagToTicket(ticketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: number) =>
      request<Tag[]>(`/tickets/${ticketId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag_id: tagId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] });
    },
  });
}

// Remove tag from ticket
export function useRemoveTagFromTicket(ticketId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: number) =>
      request<Tag[]>(`/tickets/${ticketId}/tags/${tagId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId, 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['tickets', ticketId] });
    },
  });
}

// Delete tag completely
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: number) =>
      request<void>(`/tags/${tagId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });

      // Clear sessionStorage cache for tags
      sessionStorage.removeItem('support-inbox-tags-cache');
      sessionStorage.removeItem('support-inbox-tags-cache-timestamp');
    },
  });
}
