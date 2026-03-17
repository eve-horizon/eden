import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Project role resolution — returns the user's effective role for a project.
// Drives conditional rendering across the entire UI (edit controls, approve
// buttons, member management).
// ---------------------------------------------------------------------------

export type ProjectRole = 'owner' | 'editor' | 'viewer';

interface UseProjectRoleResult {
  role: ProjectRole | null;
  loading: boolean;
  isOwner: boolean;
  canEdit: boolean;
  refetch: () => void;
}

export function useProjectRole(projectId: string | undefined): UseProjectRoleResult {
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!projectId) {
      setRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.get<{ role: ProjectRole }>(
        `/projects/${projectId}/my-role`,
      );
      setRole(data.role);
    } catch {
      // Default to viewer on error (fail-safe)
      setRole('viewer');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  return {
    role,
    loading,
    isOwner: role === 'owner',
    canEdit: role === 'owner' || role === 'editor',
    refetch: fetchRole,
  };
}
