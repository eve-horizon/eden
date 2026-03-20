import { useEffect, useRef } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// useClaimInvite — auto-claims pending project invites on first access.
//
// Fires once per project on mount. If the current user has a pending invite
// (from the app-initiated onboarding flow), it converts the invite into a
// real project_members row with the assigned role.
// ---------------------------------------------------------------------------

export function useClaimInvite(
  projectId: string | undefined,
  onClaimed?: (role: string) => void,
) {
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId || attempted.current.has(projectId)) return;
    attempted.current.add(projectId);

    api
      .post<{ claimed: boolean; role?: string }>(
        `/projects/${projectId}/claim-invite`,
        {},
      )
      .then((result) => {
        if (result.claimed && result.role) {
          onClaimed?.(result.role);
        }
      })
      .catch(() => {
        // Silent — user may not have a pending invite
      });
  }, [projectId, onClaimed]);
}
