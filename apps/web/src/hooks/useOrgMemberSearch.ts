import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// useOrgMemberSearch — typeahead search against the org member list.
//
// Queries the Eden API proxy (which forwards to Eve's member search endpoint).
// Debounce should be handled by the caller (e.g., 300ms before calling search).
// ---------------------------------------------------------------------------

export interface OrgMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
}

export function useOrgMemberSearch() {
  const [results, setResults] = useState<OrgMember[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    abortRef.current?.abort();

    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);

    try {
      const data = await api.get<{ data: OrgMember[] }>(
        `/org-members/search?q=${encodeURIComponent(query)}`,
      );
      if (!controller.signal.aborted) {
        setResults(data.data ?? []);
      }
    } catch {
      if (!controller.signal.aborted) setResults([]);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResults([]);
    setSearching(false);
  }, []);

  return { results, searching, search, clear };
}
