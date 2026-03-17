import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Project member management — CRUD for the project_members table.
// Owner-only operations (invite, role change, remove) are enforced server-side
// but the hook exposes them unconditionally for simpler call sites.
// ---------------------------------------------------------------------------

export interface ProjectMember {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  invited_by: string | null;
  created_at: string;
}

export function useMembers(projectId: string | undefined) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!projectId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<ProjectMember[]>(
        `/projects/${projectId}/members`,
      );
      setMembers(data);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const invite = useCallback(
    async (userId: string, email: string, role: string) => {
      if (!projectId) return;
      await api.post(`/projects/${projectId}/members`, {
        user_id: userId,
        email,
        role,
      });
      await fetchMembers();
    },
    [projectId, fetchMembers],
  );

  const updateRole = useCallback(
    async (memberId: string, role: string) => {
      if (!memberId) return;
      await api.patch(`/project-members/${memberId}`, { role });
      await fetchMembers();
    },
    [fetchMembers],
  );

  const remove = useCallback(
    async (memberId: string) => {
      if (!memberId) return;
      await api.delete(`/project-members/${memberId}`);
      await fetchMembers();
    },
    [fetchMembers],
  );

  return { members, loading, refetch: fetchMembers, invite, updateRole, remove };
}
