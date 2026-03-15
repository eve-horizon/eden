import { useCallback, useEffect, useState } from 'react';
import { useEveAuth } from '@eve-horizon/auth-react';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types (mirrors API response shapes)
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithCounts extends Project {
  activity_count: number;
  task_count: number;
  persona_count: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjects() {
  const { activeOrg } = useEveAuth();
  const [projects, setProjects] = useState<ProjectWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ProjectWithCounts[]>('/projects');
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [activeOrg?.id]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(
    async (name: string, slug: string): Promise<Project> => {
      const project = await api.post<Project>('/projects', { name, slug });
      await fetchProjects(); // Refresh list
      return project;
    },
    [fetchProjects],
  );

  return { projects, loading, error, refetch: fetchProjects, createProject };
}

// ---------------------------------------------------------------------------
// Single project hook
// ---------------------------------------------------------------------------

export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<Project>(`/projects/${id}`)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load project');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { project, loading, error };
}
