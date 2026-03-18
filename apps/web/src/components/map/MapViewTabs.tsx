import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';

// ---------------------------------------------------------------------------
// MapViewTabs — horizontal tab bar for saved map views (filter presets).
//
// Sits between the toolbar and persona tabs in MapPage. Each view stores a
// name and optional filter state. The active view's filters are applied to
// the URL search params, which the StoryMap reads to drive server-side
// filtering. A "+" button lets users create new views inline.
// ---------------------------------------------------------------------------

interface MapView {
  id: string;
  name: string;
  filter: Record<string, string> | null;
  created_at: string;
}

interface MapViewTabsProps {
  projectId: string;
  onApplyFilters: (filters: Record<string, string>) => void;
}

export function MapViewTabs({ projectId, onApplyFilters }: MapViewTabsProps) {
  const [views, setViews] = useState<MapView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline create state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchViews = useCallback(async () => {
    try {
      const data = await api.get<MapView[]>(
        `/projects/${projectId}/views`,
      );
      setViews(data);
    } catch {
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  // Keyboard shortcut: number keys 1-9 switch views
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // v + number for view switching (avoid conflict with persona 1-9)
      if (e.key === 'v' || e.key === 'V') {
        // We don't consume 'v' alone — it's a prefix concept
        // Instead, we'll use Alt+number which is unused
        return;
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [views]);

  const handleSelect = useCallback(
    (view: MapView) => {
      if (activeId === view.id) {
        // Deselect — clear filters
        setActiveId(null);
        onApplyFilters({});
        return;
      }
      setActiveId(view.id);
      onApplyFilters(view.filter ?? {});
    },
    [activeId, onApplyFilters],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/projects/${projectId}/views`, {
        name: newName.trim(),
        filters: {},
      });
      setNewName('');
      setCreating(false);
      await fetchViews();
    } catch {
      // Keep form open on error
    } finally {
      setSubmitting(false);
    }
  }, [projectId, newName, submitting, fetchViews]);

  if (loading && views.length === 0) return null;

  return (
    <div
      style={{
        background: '#fff',
        borderBottom: '2px solid #e2e5e9',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        zIndex: 99,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          padding: '10px 18px 10px 0',
          fontSize: '10px',
          fontWeight: 800,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          flexShrink: 0,
        }}
      >
        Views
      </span>

      {views.map((view) => {
        const isActive = activeId === view.id;
        return (
          <button
            key={view.id}
            onClick={() => handleSelect(view)}
            style={{
              padding: '10px 18px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: isActive ? '#1a1a2e' : '#6b7280',
              borderBottom: isActive ? '3px solid #e65100' : '3px solid transparent',
              transition: 'all 0.15s',
              fontFamily: 'inherit',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            data-testid={`view-tab-${view.id}`}
          >
            {view.name}
          </button>
        );
      })}

      {creating ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            placeholder="View name"
            autoFocus
            className="w-28 px-2 py-1 rounded-md border border-eden-border text-xs outline-none
                       focus:border-eden-accent bg-white"
            data-testid="new-view-input"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || submitting}
            className="px-2 py-1 rounded-md text-xs font-medium bg-eden-accent text-white
                       disabled:opacity-50 hover:opacity-90 transition-opacity"
            data-testid="save-view-btn"
          >
            Save
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="px-1.5 py-1 rounded-md text-xs text-eden-text-2 hover:text-eden-text"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center
                     text-eden-text-2 hover:bg-eden-bg hover:text-eden-text transition-colors"
          title="Create new view"
          data-testid="create-view-btn"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG
// ---------------------------------------------------------------------------

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
