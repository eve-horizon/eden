import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor: string;
  details: string | null;
  created_at: string;
}

type AuditAction = 'create' | 'update' | 'delete';

const ENTITY_TYPES = ['all', 'activity', 'step', 'task', 'question', 'release', 'changeset', 'source'] as const;
const ACTIONS = ['all', 'create', 'update', 'delete'] as const;

// ---------------------------------------------------------------------------
// AuditPage
// ---------------------------------------------------------------------------

export function AuditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Filters
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const LIMIT = 50;

  const fetchEntries = useCallback(
    async (startOffset: number, append: boolean) => {
      if (!projectId) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(startOffset),
        });
        if (entityFilter !== 'all') params.set('entity_type', entityFilter);
        if (actionFilter !== 'all') params.set('action', actionFilter);

        const data = await api.get<{ entries: AuditEntry[] }>(
          `/projects/${projectId}/audit?${params}`,
        );
        const list = data.entries ?? [];

        if (append) {
          setEntries((prev) => [...prev, ...list]);
        } else {
          setEntries(list);
        }
        setHasMore(list.length === LIMIT);
        setOffset(startOffset + list.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit log');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId, entityFilter, actionFilter],
  );

  // Reset and fetch when filters change
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchEntries(0, false);
  }, [fetchEntries]);

  const loadMore = () => {
    fetchEntries(offset, true);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-eden-text">Audit Trail</h2>
        <p className="text-sm text-eden-text-2 mt-1">
          A chronological record of every change made to this project.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <label
            htmlFor="entity-filter"
            className="block text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-1"
          >
            Entity Type
          </label>
          <select
            id="entity-filter"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-eden-border bg-eden-surface px-3 py-1.5 text-xs text-eden-text
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="action-filter"
            className="block text-[10px] font-medium text-eden-text-2 uppercase tracking-wider mb-1"
          >
            Action
          </label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-eden-border bg-eden-surface px-3 py-1.5 text-xs text-eden-text
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === 'all' ? 'All actions' : a.charAt(0).toUpperCase() + a.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <TimelineSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-eden-border" />

          <div className="space-y-0">
            {entries.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="eden-btn-secondary text-xs disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditEntryRow — single timeline entry
// ---------------------------------------------------------------------------

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  return (
    <div className="relative flex items-start gap-4 pl-10 py-3">
      {/* Timeline dot */}
      <div className="absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 border-eden-surface z-10">
        <ActionDot action={entry.action as AuditAction} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 bg-eden-surface border border-eden-border rounded-eden px-4 py-3">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <ActionBadge action={entry.action as AuditAction} />
          <EntityTypeBadge type={entry.entity_type} />
          <span className="text-xs text-eden-text-2 font-mono">
            {entry.entity_id.slice(0, 8)}
          </span>
          <span className="text-xs text-eden-text-2 ml-auto flex-shrink-0">
            {formatDateTime(entry.created_at)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-eden-text-2">
          <ActorIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-medium">{entry.actor}</span>
        </div>

        {entry.details && (
          <p className="mt-1.5 text-xs text-eden-text leading-relaxed">
            {entry.details}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionDot — colored dot on the timeline
// ---------------------------------------------------------------------------

function ActionDot({ action }: { action: AuditAction }) {
  const colors: Record<AuditAction, string> = {
    create: 'bg-emerald-500',
    update: 'bg-blue-500',
    delete: 'bg-red-500',
  };
  const color = colors[action] ?? 'bg-gray-400';
  return <div className={`w-3 h-3 rounded-full ${color}`} />;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const ACTION_STYLES: Record<AuditAction, string> = {
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
};

function ActionBadge({ action }: { action: AuditAction }) {
  const style = ACTION_STYLES[action] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${style}`}
    >
      {action}
    </span>
  );
}

const ENTITY_STYLES: Record<string, string> = {
  activity: 'bg-indigo-100 text-indigo-700',
  step: 'bg-orange-100 text-orange-700',
  task: 'bg-emerald-100 text-emerald-700',
  question: 'bg-amber-100 text-amber-700',
  release: 'bg-purple-100 text-purple-700',
  changeset: 'bg-blue-100 text-blue-700',
  source: 'bg-cyan-100 text-cyan-700',
};

function EntityTypeBadge({ type }: { type: string }) {
  const style = ENTITY_STYLES[type] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${style}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ' ' + d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Empty state & skeleton
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-eden-surface border border-eden-border mb-4">
        <AuditIcon className="w-6 h-6 text-eden-text-2" />
      </div>
      <p className="text-sm text-eden-text-2">
        No audit entries yet. Actions will appear here as changes are made.
      </p>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3 pl-10">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-eden-surface border border-eden-border rounded-eden px-4 py-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="h-4 w-14 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse ml-auto" />
          </div>
          <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function AuditIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8v4l3 3" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ActorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
