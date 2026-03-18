import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ReleaseSlice } from './ReleaseSlice';

// ---------------------------------------------------------------------------
// ReleaseSlices — container below the StoryMap grid showing horizontal
// release bands. Each band groups tasks by release assignment. Includes
// an inline create form for new releases.
// ---------------------------------------------------------------------------

interface Release {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
}

interface ReleaseTask {
  id: string;
  display_id: string;
  title: string;
  priority: string | null;
  persona_color: string | null;
}

interface ReleaseWithTasks extends Release {
  tasks: ReleaseTask[];
}

interface ReleaseSlicesProps {
  projectId: string;
  canEdit: boolean;
}

export function ReleaseSlices({ projectId, canEdit }: ReleaseSlicesProps) {
  const [releases, setReleases] = useState<ReleaseWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Inline create
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchReleases = useCallback(async () => {
    try {
      const data = await api.get<Release[]>(
        `/projects/${projectId}/releases`,
      );

      // Fetch tasks for each release in parallel
      const withTasks = await Promise.all(
        data.map(async (release) => {
          try {
            const tasks = await api.get<ReleaseTask[]>(
              `/releases/${release.id}/tasks`,
            );
            return { ...release, tasks };
          } catch {
            return { ...release, tasks: [] };
          }
        }),
      );

      setReleases(withTasks);
    } catch {
      setReleases([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  const handleRename = useCallback(
    async (releaseId: string, name: string) => {
      await api.patch(`/releases/${releaseId}`, { name });
      await fetchReleases();
    },
    [fetchReleases],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await api.post(`/projects/${projectId}/releases`, {
        name: newName.trim(),
        status: 'planning',
      });
      setNewName('');
      setShowCreate(false);
      await fetchReleases();
    } catch {
      // Keep form open on error
    } finally {
      setCreating(false);
    }
  }, [projectId, newName, creating, fetchReleases]);

  if (loading) {
    return (
      <div className="px-6 py-4">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-3" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (releases.length === 0 && !canEdit) return null;

  return (
    <div className="px-6 pb-6" data-testid="release-slices">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 mb-3 group"
      >
        <ChevronIcon
          className="w-4 h-4 text-eden-text-2 transition-transform"
          style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
        />
        <h3 className="text-xs font-bold text-eden-text-2 uppercase tracking-wider">
          Release Slices
        </h3>
        <span className="text-[10px] text-eden-text-2 bg-eden-bg px-1.5 py-0.5 rounded">
          {releases.length}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-2">
          {releases.map((release) => (
            <ReleaseSlice
              key={release.id}
              id={release.id}
              name={release.name}
              status={release.status}
              targetDate={release.target_date}
              tasks={release.tasks}
              canEdit={canEdit}
              onRename={handleRename}
            />
          ))}

          {releases.length === 0 && (
            <div className="text-center py-6 border border-dashed border-eden-border rounded-lg">
              <p className="text-xs text-eden-text-2">
                No releases yet. Create one to group tasks into release slices.
              </p>
            </div>
          )}

          {/* Inline create */}
          {canEdit && (
            <>
              {showCreate ? (
                <div className="flex items-center gap-2 p-3 bg-eden-bg rounded-lg border border-eden-border">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                      if (e.key === 'Escape') {
                        setShowCreate(false);
                        setNewName('');
                      }
                    }}
                    placeholder="Release name (e.g., v1.0)"
                    autoFocus
                    className="flex-1 px-3 py-1.5 rounded-md border border-eden-border text-sm
                               outline-none focus:border-eden-accent bg-white"
                    data-testid="new-release-input"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-eden-accent text-white
                               disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreate(false);
                      setNewName('');
                    }}
                    className="px-2 py-1.5 rounded-md text-xs text-eden-text-2 hover:text-eden-text"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                             text-eden-text-2 hover:text-eden-text hover:bg-eden-bg transition-colors
                             border border-dashed border-eden-border w-full justify-center"
                  data-testid="add-release-btn"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  Add Release
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG
// ---------------------------------------------------------------------------

function ChevronIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
    </svg>
  );
}
