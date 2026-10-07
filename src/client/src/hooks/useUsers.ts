import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { users as usersApi } from '@/lib/api';
import type { User } from '@/types';

// One cached team list for every page. User Management invalidates ['users'] after a change,
// so a renamed or deactivated agent updates everywhere at once.
export function useUsers({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// Active agents sorted by name: what assignment dropdowns offer
export function useActiveUsers(): User[] {
  const { data } = useUsers();
  return useMemo(
    () => (data ?? []).filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );
}
