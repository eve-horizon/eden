import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Question {
  id: string;
  display_id: string;
  question: string;
  answer: string | null;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

type QuestionStatus = 'open' | 'answered' | 'resolved';
type QuestionPriority = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// QuestionsPage
// ---------------------------------------------------------------------------

export function QuestionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Inline editing
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchQuestions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      const qs = params.toString();
      const data = await api.get<Question[]>(
        `/projects/${projectId}/questions${qs ? `?${qs}` : ''}`,
      );
      setQuestions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-eden-text">Questions</h2>
          <p className="text-sm text-eden-text-2 mt-1">
            Track open questions, answers, and resolutions across the project.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setExpandedId(null);
          }}
          className="eden-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          Add Question
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-eden-border bg-eden-surface px-3 py-2 text-sm text-eden-text
                     focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="resolved">Resolved</option>
        </select>

        <input
          type="text"
          placeholder="Filter by category..."
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-eden-border bg-eden-surface px-3 py-2 text-sm text-eden-text
                     placeholder:text-eden-text-2
                     focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
        />

        {(statusFilter || categoryFilter) && (
          <button
            onClick={() => {
              setStatusFilter('');
              setCategoryFilter('');
            }}
            className="text-xs text-eden-text-2 hover:text-eden-text transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Inline create */}
      {showCreate && projectId && (
        <CreateQuestionForm
          projectId={projectId}
          onCreate={() => {
            setShowCreate(false);
            fetchQuestions();
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

      {/* Loading */}
      {loading ? (
        <TableSkeleton />
      ) : questions.length === 0 ? (
        <EmptyState />
      ) : (
        /* Questions list */
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-20">
                  ID
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2">
                  Question
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-28">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-24">
                  Priority
                </th>
                <th className="text-left px-4 py-3 font-medium text-eden-text-2 w-32">
                  Category
                </th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  expanded={expandedId === q.id}
                  onToggle={() =>
                    setExpandedId(expandedId === q.id ? null : q.id)
                  }
                  onUpdated={fetchQuestions}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionRow — expandable row with inline editing
// ---------------------------------------------------------------------------

function QuestionRow({
  question: q,
  expanded,
  onToggle,
  onUpdated,
}: {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [status, setStatus] = useState(q.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/questions/${q.id}`, {
        answer: answer || undefined,
        status,
      });
      setEditing(false);
      onUpdated();
    } catch {
      // keep the form open so the user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3 font-mono text-xs text-eden-text-2">
          {q.display_id}
        </td>
        <td className="px-4 py-3 text-eden-text">{q.question}</td>
        <td className="px-4 py-3">
          <StatusBadge status={q.status as QuestionStatus} />
        </td>
        <td className="px-4 py-3">
          <PriorityLabel priority={q.priority as QuestionPriority} />
        </td>
        <td className="px-4 py-3 text-eden-text-2">
          {q.category ?? <span className="text-gray-300">--</span>}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50/30">
          <td colSpan={5} className="px-4 py-4">
            {editing ? (
              <div className="space-y-3 max-w-xl">
                <div>
                  <label className="block text-xs font-medium text-eden-text mb-1">
                    Answer
                  </label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-eden-border bg-eden-surface
                               px-3 py-2 text-sm text-eden-text
                               focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                               transition-colors resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-eden-text mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-lg border border-eden-border bg-eden-surface px-3 py-2 text-sm text-eden-text
                               focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
                  >
                    <option value="open">Open</option>
                    <option value="answered">Answered</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="eden-btn-primary text-xs disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="eden-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {q.answer ? (
                  <div>
                    <p className="text-xs font-medium text-eden-text-2 mb-1">
                      Answer
                    </p>
                    <p className="text-sm text-eden-text whitespace-pre-wrap">
                      {q.answer}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-eden-text-2 italic">
                    No answer yet.
                  </p>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }}
                  className="text-xs font-medium text-eden-accent hover:text-eden-accent-dark transition-colors"
                >
                  Edit
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// CreateQuestionForm
// ---------------------------------------------------------------------------

function CreateQuestionForm({
  projectId,
  onCreate,
  onCancel,
}: {
  projectId: string;
  onCreate: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/questions`, {
        question: text.trim(),
        priority,
        category: category.trim() || undefined,
      });
      onCreate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create question',
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="eden-card p-5 mb-4">
      <h3 className="text-sm font-semibold text-eden-text mb-4">
        Add a question
      </h3>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-4">
        <div>
          <label
            htmlFor="q-text"
            className="block text-xs font-medium text-eden-text mb-1"
          >
            Question
          </label>
          <textarea
            id="q-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be clarified?"
            rows={2}
            autoFocus
            className="w-full rounded-lg border border-eden-border bg-eden-surface
                       px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2
                       focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                       transition-colors resize-y"
          />
        </div>

        <div className="flex gap-3">
          <div>
            <label
              htmlFor="q-priority"
              className="block text-xs font-medium text-eden-text mb-1"
            >
              Priority
            </label>
            <select
              id="q-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-lg border border-eden-border bg-eden-surface px-3 py-2 text-sm text-eden-text
                         focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="flex-1">
            <label
              htmlFor="q-category"
              className="block text-xs font-medium text-eden-text mb-1"
            >
              Category
            </label>
            <input
              id="q-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. UX, Security, API"
              className="w-full rounded-lg border border-eden-border bg-eden-surface
                         px-3 py-2 text-sm text-eden-text placeholder:text-eden-text-2
                         focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                         transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          className="eden-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Adding...' : 'Add Question'}
        </button>
        <button type="button" onClick={onCancel} className="eden-btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Status & Priority badges
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<QuestionStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  answered: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
};

function StatusBadge({ status }: { status: QuestionStatus }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}
    >
      {status}
    </span>
  );
}

const PRIORITY_STYLES: Record<QuestionPriority, string> = {
  low: 'text-gray-500',
  medium: 'text-eden-text-2',
  high: 'text-amber-600',
  critical: 'text-red-600 font-semibold',
};

function PriorityLabel({ priority }: { priority: QuestionPriority }) {
  const style = PRIORITY_STYLES[priority] ?? 'text-eden-text-2';
  return <span className={`text-xs capitalize ${style}`}>{priority}</span>;
}

// ---------------------------------------------------------------------------
// Empty state & skeleton
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-eden-text-2">
        No questions found. Add one to start tracking.
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-0"
        >
          <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 flex-1 bg-gray-100 rounded animate-pulse" />
          <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon
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
