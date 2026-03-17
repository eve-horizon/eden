import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Pending approval items — fetches changeset items awaiting owner review.
// Used by MapPage to show the approval badge and by future approval panels.
// ---------------------------------------------------------------------------

export interface PendingApprovalItem {
  id: string;
  changeset_id: string;
  entity_type: string;
  operation: string;
  description: string | null;
  display_reference: string | null;
  approval_status: string;
  created_at: string;
}

export function usePendingApprovals(projectId: string | undefined) {
  const [items, setItems] = useState<PendingApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<PendingApprovalItem[]>(
        `/projects/${projectId}/pending-approvals`,
      );
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const approve = useCallback(
    async (itemIds: string[]) => {
      if (!projectId) return;
      await api.post(`/projects/${projectId}/approve-items`, {
        item_ids: itemIds,
      });
      await fetchItems();
    },
    [projectId, fetchItems],
  );

  const reject = useCallback(
    async (itemIds: string[]) => {
      if (!projectId) return;
      await api.post(`/projects/${projectId}/reject-items`, {
        item_ids: itemIds,
      });
      await fetchItems();
    },
    [projectId, fetchItems],
  );

  return { items, loading, refetch: fetchItems, approve, reject };
}
