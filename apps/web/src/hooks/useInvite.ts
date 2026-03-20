import { useCallback, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// useInvite — calls the smart invite endpoint that checks Eve org membership.
//
// Returns { status: 'added' } for existing org members (instant) or
// { status: 'invited' } for new users (sends email via Eve platform).
// ---------------------------------------------------------------------------

export interface InviteResult {
  status: 'added' | 'invited';
  user_id?: string;
  invite_code?: string;
}

export function useInvite(projectId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<InviteResult | null>(null);

  const invite = useCallback(
    async (email: string, role: string): Promise<InviteResult> => {
      if (!projectId) throw new Error('No project');
      setLoading(true);
      setError(null);
      setLastResult(null);
      try {
        const result = await api.post<InviteResult>(
          `/projects/${projectId}/invite`,
          { email, role },
        );
        setLastResult(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invite failed';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
  }, []);

  return { invite, loading, error, lastResult, reset };
}
