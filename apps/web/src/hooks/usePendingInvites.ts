import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// usePendingInvites — lists and cancels pending project invites (owner only).
// ---------------------------------------------------------------------------

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string;
}

export function usePendingInvites(projectId: string | undefined) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvites = useCallback(async () => {
    if (!projectId) {
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<PendingInvite[]>(
        `/projects/${projectId}/invites`,
      );
      setInvites(data);
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const cancel = useCallback(
    async (inviteId: string) => {
      if (!projectId) return;
      await api.delete(`/projects/${projectId}/invites/${inviteId}`);
      await fetchInvites();
    },
    [projectId, fetchInvites],
  );

  return { invites, loading, refetch: fetchInvites, cancel };
}
