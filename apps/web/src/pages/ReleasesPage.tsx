import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Release {
  id: string;
  name: string;
  target_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type ReleaseStatus = 'planning' | 'active' | 'released';

// ---------------------------------------------------------------------------
// ReleasesPage
// ---------------------------------------------------------------------------

export function ReleasesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchReleases = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Release[]>(
        `/projects/${projectId}/releases`,
      );
      setReleases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load releases');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReleases();
  }, [fetchReleases]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-eden-text">Releases</h2>
          <p className="text-sm text-eden-text-2 mt-1">
            Plan releases, set target dates, and track progress.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="eden-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          New Release
        </button>
      </div>

      {/* Inline create */}
      {showCreate && projectId && (
        <CreateReleaseForm
          projectId={projectId}
          onCreate={() => {
            setShowCreate(false);
            fetchReleases();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <CardSkeleton />
      ) : releases.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReleaseCard
// ---------------------------------------------------------------------------

function ReleaseCard({ release }: { release: Release }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-semibold text-eden-text">
          {release.name}
        </h3>
        <ReleaseStatusBadge status={release.status as ReleaseStatus} />
      </div>

      <div className="space-y-2 text-sm text-eden-text-2">
        {release.target_date ? (
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-eden-text-2" />
            <span>{formatDate(release.target_date)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-gray-300" />
            <span className="text-gray-400">No target date</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateReleaseForm
// ---------------------------------------------------------------------------

function CreateReleaseForm({
  projectId,
  onCreate,
  onCancel,
}: {
  projectId: string;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState('planning');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/releases`, {
        name: name.trim(),
        target_date: targetDate || undefined,
        status,
      });
      onCreate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create release',
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="eden-card p-5 mb-4">
      <h3 className="text-sm font-semibold text-eden-text mb-4">
        Create a new release
      </h3>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label
            htmlFor="release-name"
            className="block text-xs font-medium text-eden-text mb-1"
          >
            Name
          </label>
          <input
            id="release-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="v1.0"
            autoFocus
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="release-date"
            className="block text-xs font-medium text-eden-text mb-1"
          >
            Target Date
          </label>
          <input
            id="release-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="release-status"
            className="block text-xs font-medium text-eden-text mb-1"
          >
            Status
          </label>
          <select
            id="release-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-eden-border bg-eden-surface px-3 py-2 text-sm text-eden-text
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
          >
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="released">Released</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="eden-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating...' : 'Create Release'}
        </button>
        <button type="button" onClick={onCancel} className="eden-btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const RELEASE_STATUS_STYLES: Record<ReleaseStatus, string> = {
  planning: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-800',
  released: 'bg-emerald-100 text-emerald-800',
};

function ReleaseStatusBadge({ status }: { status: ReleaseStatus }) {
  const style = RELEASE_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
    <div className="text-center py-12">
      <p className="text-sm text-eden-text-2">
        No releases yet. Create one to start planning.
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
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

function CalendarIcon({ className }: { className?: string }) {
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
