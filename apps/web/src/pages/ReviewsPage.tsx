import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpertOpinion {
  expert_slug: string;
  summary: string;
}

interface Review {
  id: string;
  title: string;
  status: string;
  synthesis: string | null;
  expert_count: number;
  expert_opinions: ExpertOpinion[];
  created_at: string;
}

type ReviewStatus = 'pending' | 'in_progress' | 'complete';

// ---------------------------------------------------------------------------
// ReviewsPage
// ---------------------------------------------------------------------------

export function ReviewsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Review[]>(`/projects/${projectId}/reviews`);
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-eden-text">Reviews</h2>
        <p className="text-sm text-eden-text-2 mt-1">
          Expert panel reviews with synthesis and individual opinions.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <EmptyState />
      ) : reviews.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              expanded={expandedId === review.id}
              onToggle={() => toggleExpand(review.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

function ReviewCard({
  review,
  expanded,
  onToggle,
}: {
  review: Review;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-eden-surface border border-eden-border rounded-eden overflow-hidden transition-all">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-eden-bg/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <h3 className="text-sm font-semibold text-eden-text truncate">
                {review.title}
              </h3>
              <ReviewStatusBadge status={review.status as ReviewStatus} />
            </div>
            <div className="flex items-center gap-4 text-xs text-eden-text-2">
              <span className="flex items-center gap-1.5">
                <ExpertsIcon className="w-3.5 h-3.5" />
                {review.expert_count} expert{review.expert_count !== 1 ? 's' : ''}
              </span>
              <span>{formatDate(review.created_at)}</span>
            </div>
          </div>
          <ChevronIcon
            className={`w-5 h-5 text-eden-text-2 flex-shrink-0 mt-0.5 transition-transform duration-200
              ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-eden-border px-5 py-4 space-y-4">
          {/* Synthesis */}
          {review.synthesis && (
            <div>
              <h4 className="text-xs font-semibold text-eden-text uppercase tracking-wider mb-2">
                Synthesis
              </h4>
              <div
                className="rounded-lg bg-eden-bg/50 border border-eden-border p-4 text-sm text-eden-text leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: renderMarkdownInline(review.synthesis) }}
              />
            </div>
          )}

          {/* Expert opinions */}
          {review.expert_opinions && review.expert_opinions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-eden-text uppercase tracking-wider mb-2">
                Expert Opinions
              </h4>
              <div className="space-y-2">
                {review.expert_opinions.map((opinion) => (
                  <div
                    key={opinion.expert_slug}
                    className="flex gap-3 rounded-lg border border-eden-border p-3"
                  >
                    <ExpertBadge slug={opinion.expert_slug} />
                    <p className="text-sm text-eden-text leading-relaxed flex-1">
                      {opinion.summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty detail state */}
          {!review.synthesis &&
            (!review.expert_opinions || review.expert_opinions.length === 0) && (
              <p className="text-sm text-eden-text-2 italic">
                Review is still in progress. Expert opinions will appear here once
                complete.
              </p>
            )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExpertBadge
// ---------------------------------------------------------------------------

const EXPERT_COLORS: Record<string, string> = {
  'tech-lead': 'bg-blue-100 text-blue-800',
  'ux-advocate': 'bg-purple-100 text-purple-800',
  'biz-analyst': 'bg-emerald-100 text-emerald-800',
  'gtm-advocate': 'bg-orange-100 text-orange-800',
  'risk-assessor': 'bg-red-100 text-red-800',
  'qa-strategist': 'bg-cyan-100 text-cyan-800',
  'devils-advocate': 'bg-gray-200 text-gray-800',
};

function ExpertBadge({ slug }: { slug: string }) {
  const color = EXPERT_COLORS[slug] ?? 'bg-gray-100 text-gray-700';
  const label = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${color}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const REVIEW_STATUS_STYLES: Record<ReviewStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  complete: 'bg-emerald-100 text-emerald-800',
};

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const style = REVIEW_STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700';
  const label = status.replace('_', ' ');
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${style}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render **bold** and *italic* markdown inline — no dependencies. */
function renderMarkdownInline(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

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
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-eden-surface border border-eden-border mb-4">
        <ReviewIcon className="w-6 h-6 text-eden-text-2" />
      </div>
      <p className="text-sm text-eden-text-2">
        No reviews yet. They appear here after expert panel analysis.
      </p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-eden-surface border border-eden-border rounded-eden p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ReviewIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ExpertsIcon({ className }: { className?: string }) {
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
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
