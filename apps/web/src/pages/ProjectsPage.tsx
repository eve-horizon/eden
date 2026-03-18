import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, type ProjectWithCounts } from '../hooks/useProjects';
import { ProjectWizard } from '../components/projects/ProjectWizard';

// ---------------------------------------------------------------------------
// ProjectsPage — grid of project cards + inline create form
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const { projects, loading, error, refetch } = useProjects();
  const [showCreate, setShowCreate] = useState(false);

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
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------

function ProjectCard({ project }: { project: ProjectWithCounts }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/projects/${project.id}/map`)}
      className="eden-card p-5 text-left w-full group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-semibold text-eden-text group-hover:text-eden-accent transition-colors">
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
