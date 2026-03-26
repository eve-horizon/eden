import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, type ProjectWithCounts } from '../hooks/useProjects';
import { ProjectWizard } from '../components/projects/ProjectWizard';

// ---------------------------------------------------------------------------
// ProjectsPage — grid of project cards + inline create form
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const { projects, loading, error, refetch, deleteProject } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectWithCounts | null>(null);

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-eden-text">Projects</h2>
          <p className="text-sm text-eden-text-2 mt-1">
            Select a project to view its story map, questions, and releases.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="eden-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showCreate && (
        <ProjectWizard
          onClose={() => setShowCreate(false)}
          onProjectCreated={refetch}
        />
      )}

      {projects.length === 0 && !showCreate ? (
        <EmptyState onCreateClick={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onConfirm={async () => {
            await deleteProject(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectWithCounts;
  onDelete: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="eden-card p-5 group relative">
      <button
        onClick={() => navigate(`/projects/${project.id}/map`)}
        className="text-left w-full"
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base font-semibold text-eden-text group-hover:text-eden-accent transition-colors pr-8">
            {project.name}
          </h3>
          <ArrowIcon className="w-4 h-4 text-eden-text-2 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
        </div>

        <p className="text-xs font-mono text-eden-text-2 mb-4">{project.slug}</p>

        <div className="flex items-center gap-4 text-xs text-eden-text-2">
          <span className="flex items-center gap-1">
            <CountDot className="bg-eden-activity" />
            {project.activity_count} {project.activity_count === 1 ? 'activity' : 'activities'}
          </span>
          <span className="flex items-center gap-1">
            <CountDot className="bg-eden-accent" />
            {project.task_count} {project.task_count === 1 ? 'task' : 'tasks'}
          </span>
          <span className="flex items-center gap-1">
            <CountDot className="bg-eden-green" />
            {project.persona_count} {project.persona_count === 1 ? 'persona' : 'personas'}
          </span>
        </div>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-3 right-3 p-1.5 rounded-md text-eden-text-2 opacity-0 group-hover:opacity-100
                   hover:bg-red-50 hover:text-red-600 transition-all"
        title="Delete project"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeleteProjectModal
// ---------------------------------------------------------------------------

function DeleteProjectModal({
  project,
  onConfirm,
  onClose,
}: {
  project: ProjectWithCounts;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmText === project.slug;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, deleting]);

  const handleDelete = useCallback(async () => {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      setDeleting(false);
    }
  }, [confirmed, onConfirm]);

  const totalEntities =
    project.activity_count + project.task_count + project.persona_count;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={deleting ? undefined : onClose}
      />
      <div className="relative w-full max-w-md bg-eden-surface rounded-eden shadow-modal border border-eden-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-eden-border">
          <h3 className="text-base font-semibold text-red-600">Delete Project</h3>
          <button
            onClick={onClose}
            disabled={deleting}
            className="p-1 rounded-md text-eden-text-2 hover:bg-eden-hover transition-colors disabled:opacity-50"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-eden-text">
            This will permanently delete{' '}
            <span className="font-semibold">{project.name}</span>
            {totalEntities > 0 && (
              <>
                {' '}and all its data ({project.activity_count} activities,{' '}
                {project.task_count} tasks, {project.persona_count} personas)
              </>
            )}
            . This action cannot be undone.
          </p>

          <div>
            <label
              htmlFor="delete-confirm"
              className="block text-sm text-eden-text-2 mb-1.5"
            >
              Type <span className="font-mono font-semibold text-eden-text">{project.slug}</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={project.slug}
              autoFocus
              disabled={deleting}
              className="w-full rounded-lg border border-eden-border bg-eden-surface
                         px-3 py-2 text-sm font-mono text-eden-text placeholder:text-eden-text-2
                         focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500
                         transition-colors disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmed) handleDelete();
              }}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-eden-border">
          <button
            onClick={onClose}
            disabled={deleting}
            className="eden-btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white
                       bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateProjectForm
// ---------------------------------------------------------------------------

// Kept as fallback — wizard is the primary creation flow
export function CreateProjectForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, slug: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deriveSlug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-derive slug unless the user has manually edited it
    if (!slug || slug === deriveSlug(name)) {
      setSlug(deriveSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim(), slug.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="eden-card p-5 mb-6"
    >
      <h3 className="text-sm font-semibold text-eden-text mb-4">
        Create a new project
      </h3>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor="project-name"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Name
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Project"
            autoFocus
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="project-slug"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Slug
          </label>
          <input
            id="project-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-project"
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm font-mono text-eden-text placeholder:text-eden-text-2
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !name.trim() || !slug.trim()}
          className="eden-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating...' : 'Create Project'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="eden-btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-eden-accent-light mb-4">
        <FolderIcon className="w-8 h-8 text-eden-accent" />
      </div>
      <h3 className="text-lg font-semibold text-eden-text mb-1">No projects yet</h3>
      <p className="text-sm text-eden-text-2 mb-6">
        Create your first project to get started with Eden.
      </p>
      <button onClick={onCreateClick} className="eden-btn-primary">
        <PlusIcon className="w-4 h-4" />
        Create Project
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="h-7 w-32 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-64 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="eden-card p-5 space-y-3">
            <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
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

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5 10a.75.75 0 01.75-.75h6.638L10.23 7.29a.75.75 0 111.04-1.08l3.5 3.25a.75.75 0 010 1.08l-3.5 3.25a.75.75 0 11-1.04-1.08l2.158-1.96H5.75A.75.75 0 015 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
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
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function CountDot({ className }: { className?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${className}`} />;
}
