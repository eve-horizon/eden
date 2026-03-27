import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectWizardProps {
  onClose: () => void;
  onProjectCreated: () => void;
}

type WizardStep = 'basics' | 'context' | 'generate' | 'review';

const ACCEPTED_TYPES = [
  'application/pdf',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.txt', '.docx', '.doc', '.markdown'];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function isAcceptedFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
    return 'Unsupported file type. Accepted: PDF, Markdown, Word, text.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ProjectWizard — multi-step modal for creating projects with AI map gen
// ---------------------------------------------------------------------------

export function ProjectWizard({ onClose, onProjectCreated }: ProjectWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('basics');

  // Step 1: Basics
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Context
  const [audience, setAudience] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [constraints, setConstraints] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 3: Generation state
  const [generating, setGenerating] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  // changesetId is tracked for potential future use (e.g. changeset link)
  // but not displayed in the current auto-accept flow
  const [, setChangesetId] = useState<string | null>(null);
  const [uploadedSourceId, setUploadedSourceId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track whether a project was created so we can notify the parent at the
  // right time (on navigation away) rather than mid-generation — calling
  // onProjectCreated during generation triggers a parent re-render that
  // unmounts this component and resets wizard state back to step 1.
  const projectCreatedRef = useRef(false);

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

  const handleFileChange = (f: File | null) => {
    setFileError(null);
    if (f) {
      const error = isAcceptedFile(f);
      if (error) {
        setFileError(error);
        return;
      }
    }
    setFile(f);
    // Clear cached source_id when file changes (force re-upload)
    setUploadedSourceId(null);
  };

  // Clean up polling on unmount; notify parent if a project was created
  // so the project list refreshes once the wizard is gone.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (projectCreatedRef.current) onProjectCreated();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setGenError(null);

    try {
      // Reuse existing project on regenerate
      let pid = projectId;
      if (!pid) {
        setGenStatus('Creating project...');
        const project = await api.post<{ id: string }>('/projects', {
          name: name.trim(),
          slug: slug.trim(),
        });
        pid = project.id;
        setProjectId(pid);
        projectCreatedRef.current = true;
      }

      // Upload document if selected (and not already uploaded)
      let sourceId: string | undefined;
      if (uploadedSourceId) {
        sourceId = uploadedSourceId;
      } else if (file) {
        setGenStatus('Uploading document...');
        const source = await api.post<{ id: string; upload_url: string }>(
          `/projects/${pid}/sources`,
          {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            file_size: file.size,
          },
        );

        if (source.upload_url) {
          await fetch(source.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
        }

        sourceId = source.id;
        setUploadedSourceId(source.id);
      }

      // Trigger map generation
      setGenStatus('Generating story map...');
      const body: Record<string, string> = {};
      if (description.trim()) body.description = description.trim();
      if (audience.trim()) body.audience = audience.trim();
      if (capabilities.trim()) body.capabilities = capabilities.trim();
      if (constraints.trim()) body.constraints = constraints.trim();
      if (sourceId) body.source_id = sourceId;

      const result = await api.post<{ job_id: string }>(
        `/projects/${pid}/generate-map`,
        body,
      );

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.get<{
            status: string;
            changeset_id?: string;
            error?: string;
          }>(`/projects/${pid}/generate-map/status?job_id=${result.job_id}`);

          if (status.status === 'complete') {
            if (pollRef.current) clearInterval(pollRef.current);
            setChangesetId(status.changeset_id ?? null);
            setStep('review');
            setGenerating(false);
          } else if (status.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenError(status.error ?? 'Generation failed');
            setGenerating(false);
          }
        } catch {
          // Keep polling on transient errors
        }
      }, 3000);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : 'Failed to start generation',
      );
      setGenerating(false);
    }
  }, [name, slug, description, audience, capabilities, constraints, file, projectId, uploadedSourceId]);

  const handleSkipToCreate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const project = await api.post<{ id: string }>('/projects', {
        name: name.trim(),
        slug: slug.trim(),
      });
      onProjectCreated();
      navigate(`/projects/${project.id}/map`);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : 'Failed to create project',
      );
      setGenerating(false);
    }
  }, [name, slug, onProjectCreated, navigate]);

  const canProceed = !!name.trim() && !!slug.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-eden-surface rounded-eden shadow-modal border border-eden-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-eden-border flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-eden-text">
                Create Project
              </h2>
              <StepIndicator current={step} />
            </div>
            <button
              onClick={onClose}
              className="text-eden-text-2 hover:text-eden-text transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'basics' && (
            <BasicsStep
              name={name}
              slug={slug}
              description={description}
              onNameChange={handleNameChange}
              onSlugChange={setSlug}
              onDescriptionChange={setDescription}
              onNext={() => setStep('context')}
              onSkip={handleSkipToCreate}
              canProceed={canProceed}
              generating={generating}
              error={genError}
            />
          )}

          {step === 'context' && (
            <ContextStep
              audience={audience}
              capabilities={capabilities}
              constraints={constraints}
              file={file}
              fileError={fileError}
              onAudienceChange={setAudience}
              onCapabilitiesChange={setCapabilities}
              onConstraintsChange={setConstraints}
              onFileChange={handleFileChange}
              onBack={() => setStep('basics')}
              onGenerate={() => {
                setStep('generate');
                startGeneration();
              }}
            />
          )}

          {step === 'generate' && (
            <GenerateStep
              status={genStatus}
              error={genError}
              generating={generating}
              onRetry={() => setStep('context')}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              onDone={() => navigate(`/projects/${projectId}/map`)}
              onRegenerate={() => {
                setStep('context');
                setChangesetId(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'context', label: 'Context' },
  { key: 'generate', label: 'Generate' },
  { key: 'review', label: 'Review' },
];

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <span
            className={`text-xs font-medium ${
              i <= currentIdx ? 'text-eden-accent' : 'text-eden-text-2'
            }`}
          >
            {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="text-eden-border text-xs mx-0.5">/</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Basics
// ---------------------------------------------------------------------------

function BasicsStep({
  name,
  slug,
  description,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
  onNext,
  onSkip,
  canProceed,
  generating,
  error,
}: {
  name: string;
  slug: string;
  description: string;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
  canProceed: boolean;
  generating: boolean;
  error: string | null;
}) {
  return (
    <div>
      <p className="text-sm text-eden-text-2 mb-5">
        Start with the basics. You can use AI to generate an initial story map,
        or create an empty project.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="wiz-name"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Project Name <span className="text-red-500">*</span>
          </label>
          <input
            id="wiz-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
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
            htmlFor="wiz-slug"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Slug
          </label>
          <input
            id="wiz-slug"
            type="text"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder="my-project"
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm font-mono text-eden-text placeholder:text-eden-text-2
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="wiz-desc"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Description{' '}
            <span className="text-eden-text-2 font-normal">(optional)</span>
          </label>
          <textarea
            id="wiz-desc"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe what this project is about..."
            rows={3}
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2 resize-none
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-eden-border">
        <button
          onClick={onSkip}
          disabled={!canProceed || generating}
          className="text-sm text-eden-text-2 hover:text-eden-text disabled:opacity-50 transition-colors"
        >
          {generating ? 'Creating...' : 'Skip — create empty project'}
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="eden-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Add Context
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Context (with FileDropZone)
// ---------------------------------------------------------------------------

function ContextStep({
  audience,
  capabilities,
  constraints,
  file,
  fileError,
  onAudienceChange,
  onCapabilitiesChange,
  onConstraintsChange,
  onFileChange,
  onBack,
  onGenerate,
}: {
  audience: string;
  capabilities: string;
  constraints: string;
  file: File | null;
  fileError: string | null;
  onAudienceChange: (v: string) => void;
  onCapabilitiesChange: (v: string) => void;
  onConstraintsChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-eden-text-2 mb-5">
        Help the AI understand your project better. All fields are optional but
        improve generation quality.
      </p>

      <div className="space-y-4">
        <FileDropZone file={file} error={fileError} onChange={onFileChange} />

        <div>
          <label
            htmlFor="wiz-audience"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Target Audience / Personas
          </label>
          <textarea
            id="wiz-audience"
            value={audience}
            onChange={(e) => onAudienceChange(e.target.value)}
            placeholder="Who will use this product? e.g., Product managers, developers, end users..."
            rows={2}
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2 resize-none
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="wiz-caps"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Key Capabilities / Goals
          </label>
          <textarea
            id="wiz-caps"
            value={capabilities}
            onChange={(e) => onCapabilitiesChange(e.target.value)}
            placeholder="What should this product do? e.g., Real-time collaboration, document versioning..."
            rows={2}
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2 resize-none
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="wiz-constraints"
            className="block text-sm font-medium text-eden-text mb-1.5"
          >
            Constraints or Requirements
          </label>
          <textarea
            id="wiz-constraints"
            value={constraints}
            onChange={(e) => onConstraintsChange(e.target.value)}
            placeholder="Any technical, legal, or business constraints? e.g., Must support offline mode..."
            rows={2}
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2 resize-none
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-eden-border">
        <button
          onClick={onBack}
          className="eden-btn-secondary"
        >
          Back
        </button>
        <button
          onClick={onGenerate}
          className="eden-btn-primary shadow-md hover:shadow-lg transition-shadow"
        >
          <SparklesIcon className="w-4 h-4" />
          Generate Story Map
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileDropZone — drag-and-drop / click-to-browse file picker
// ---------------------------------------------------------------------------

function FileDropZone({
  file,
  error,
  onChange,
}: {
  file: File | null;
  error: string | null;
  onChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onChange(dropped);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  return (
    <div>
      <div
        data-testid="wizard-file-dropzone"
        className={`relative rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-eden-accent bg-eden-accent/5'
            : error
              ? 'border-red-300 bg-red-50/50'
              : file
                ? 'border-eden-accent/50 bg-eden-accent/5'
                : 'border-eden-border hover:border-eden-accent/50'
        } px-4 py-3`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
      >
        <input
          data-testid="wizard-file-input"
          type="file"
          accept=".pdf,.md,.txt,.docx,.doc,.markdown"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onChange(f);
            // Reset so re-selecting the same file still fires onChange
            e.target.value = '';
          }}
        />

        {file ? (
          <div className="flex items-center gap-2">
            <DocumentIcon className="w-5 h-5 text-eden-accent flex-shrink-0" />
            <span
              data-testid="wizard-file-name"
              className="text-sm text-eden-text truncate flex-1"
            >
              {file.name}
            </span>
            <button
              data-testid="wizard-file-remove"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-eden-text-2 hover:text-red-500 transition-colors flex-shrink-0"
              aria-label="Remove file"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-center py-1">
            <p className="text-sm text-eden-text-2">
              <span className="text-eden-accent font-medium">
                Attach a document
              </span>{' '}
              (optional)
            </p>
            <p className="text-xs text-eden-text-2 mt-0.5">
              Drop a file here or click to browse — PDF, Markdown, Word, text — up to 10MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <p
          data-testid="wizard-file-error"
          className="text-xs text-red-600 mt-1"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Generate (loading / error state)
// ---------------------------------------------------------------------------

function GenerateStep({
  status,
  error,
  generating,
  onRetry,
}: {
  status: string;
  error: string | null;
  generating: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="text-center py-8">
      {generating && !error ? (
        <>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-eden-accent-light mb-4">
            <div className="w-8 h-8 border-[3px] border-eden-accent border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-base font-semibold text-eden-text mb-2">
            Generating your story map
          </h3>
          <p className="text-sm text-eden-text-2">{status}</p>
          <p className="text-xs text-eden-text-2 mt-2">
            This usually takes 30-60 seconds...
          </p>
        </>
      ) : error ? (
        <>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
            <CloseIcon className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-eden-text mb-2">
            Generation failed
          </h3>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <button onClick={onRetry} className="eden-btn-secondary">
            Try Again
          </button>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review (WS1: auto-accepted, no changeset link)
// ---------------------------------------------------------------------------

function ReviewStep({
  onDone,
  onRegenerate,
}: {
  onDone: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-4">
        <CheckIcon className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="text-base font-semibold text-eden-text mb-2">
        Story map generated!
      </h3>
      <p className="text-sm text-eden-text-2 mb-6 max-w-md mx-auto">
        Your story map is ready! View it now, or regenerate with different context.
      </p>

      <div className="flex items-center justify-center gap-3">
        <button onClick={onDone} className="eden-btn-primary shadow-md">
          View Story Map
        </button>
        <button onClick={onRegenerate} className="eden-btn-secondary">
          Regenerate
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06a.75.75 0 11-1.061 1.061l-1.06-1.06a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 01-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zM10 7a3 3 0 100 6 3 3 0 000-6zm-6.25 3a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm11.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm-8.139 3.889a.75.75 0 011.06 0l1.061 1.06a.75.75 0 11-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zm6.878 0a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 01-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
