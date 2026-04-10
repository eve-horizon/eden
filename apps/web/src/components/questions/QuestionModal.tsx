import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AnswerProgress } from './AnswerProgress';
import { MentionDropdown } from '../mentions/MentionDropdown';
import type { MentionItem } from '../../hooks/useMentionAutocomplete';
import { useMentionAutocomplete } from '../../hooks/useMentionAutocomplete';

// ---------------------------------------------------------------------------
// QuestionModal — full-detail view for a single question
//
// Centered modal with backdrop blur. Shows question text, priority/category
// badges, entity reference tags, and a textarea for answering. Autosaves
// the answer via PATCH /api/questions/:id with a 1-second debounce. "Evolve
// Map" button triggers the AI evolution pipeline. Header shows overall
// project question progress.
// ---------------------------------------------------------------------------

interface QuestionRef {
  id: string;
  entity_type: string;
  entity_id: string;
  display_id: string | null;
}

interface QuestionDetail {
  id: string;
  display_id: string;
  project_id?: string;
  question: string;
  answer: string | null;
  status: string;
  priority: string;
  category: string | null;
  references: QuestionRef[];
}

interface ProjectQuestionStats {
  total: number;
  answered: number;
}

interface QuestionModalProps {
  questionId: string | null;
  onClose: () => void;
  onReferenceClick?: (displayId: string) => void;
  mentionItems?: MentionItem[];
}

export function QuestionModal({
  questionId,
  onClose,
  onReferenceClick,
  mentionItems = [],
}: QuestionModalProps) {
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  );
  const [evolving, setEvolving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [questionStats, setQuestionStats] = useState<ProjectQuestionStats>({
    total: 0,
    answered: 0,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!questionId) return;
    setLoading(true);
    api
      .get<QuestionDetail>(`/questions/${questionId}`)
      .then((q) => {
        setDetail(q);
        setAnswer(q.answer ?? '');

        // Fetch project-level question stats for the progress bar
        if (q.project_id) {
          api
            .get<{ total: number; answered: number }>(
              `/projects/${q.project_id}/questions/stats`,
            )
            .then(setQuestionStats)
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [questionId]);

  // Autosave with debounce — persists via PATCH /api/questions/:id
  const handleAnswerChange = useCallback(
    (value: string) => {
      setAnswer(value);
      setSaveStatus('saving');

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!questionId) return;
        try {
          await api.patch(`/questions/${questionId}`, { answer: value });
          setSaveStatus('saved');

          // Update the local stats optimistically
          setQuestionStats((prev) => {
            const wasPreviouslyAnswered =
              detail?.answer != null && detail.answer.trim() !== '';
            const isNowAnswered = value.trim() !== '';
            if (wasPreviouslyAnswered === isNowAnswered) return prev;
            return {
              ...prev,
              answered: prev.answered + (isNowAnswered ? 1 : -1),
            };
          });
        } catch {
          setSaveStatus('idle');
        }
      }, 1000);
    },
    [questionId, detail],
  );

  const {
    ariaProps,
    dropdownId,
    filteredMentions,
    handleCaretChange,
    handleInputChange,
    handleMentionKeyDown,
    highlightedIndex,
    insertMention,
    isMentionOpen,
    setHighlightedIndex,
  } = useMentionAutocomplete({
    items: mentionItems,
    value: answer,
    onValueChange: handleAnswerChange,
    textareaRef,
  });

  const handleEvolve = async () => {
    if (!questionId || !answer.trim()) return;
    setEvolving(true);
    try {
      await api.post(`/questions/${questionId}/evolve`, {
        answer: answer.trim(),
      });
      setToast('Question evolution triggered — map update incoming');
      setTimeout(() => {
        setToast(null);
        onClose();
      }, 2000);
    } catch {
      setToast('Failed to trigger evolution');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEvolving(false);
    }
  };

  const handleRefClick = (displayId: string) => {
    onClose();
    // Small delay to let modal close before scrolling
    setTimeout(() => onReferenceClick?.(displayId), 100);
  };

  if (!questionId) return null;

  const priorityColor =
    detail?.priority === 'high'
      ? 'bg-red-100 text-red-700'
      : detail?.priority === 'medium'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';

  const categoryColor =
    detail?.category === 'conflict'
      ? 'bg-red-100 text-red-700'
      : detail?.category === 'gap'
        ? 'bg-amber-100 text-amber-700'
        : detail?.category === 'duplicate'
          ? 'bg-purple-100 text-purple-700'
          : 'bg-gray-100 text-gray-600';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      data-testid="question-modal"
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[680px] max-h-[85vh] bg-eden-surface rounded-2xl shadow-2xl border border-eden-border flex flex-col overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-eden-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-eden-text-2">
                    {detail.display_id}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${priorityColor}`}
                  >
                    {detail.priority}
                  </span>
                  {detail.category && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${categoryColor}`}
                    >
                      {detail.category}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-eden-text-2 hover:text-eden-text transition-colors"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              <p className="text-base font-medium text-eden-text mt-3 leading-relaxed">
                {detail.question}
              </p>

              {/* Reference tags */}
              {detail.references.length > 0 && (
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {detail.references.map((ref) => (
                    <button
                      key={ref.id}
                      onClick={() =>
                        ref.display_id && handleRefClick(ref.display_id)
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono
                                 bg-eden-accent/10 text-eden-accent hover:bg-eden-accent/20 transition-colors"
                    >
                      {ref.display_id || ref.entity_type}
                    </button>
                  ))}
                </div>
              )}

              {/* Answer progress bar */}
              {questionStats.total > 0 && (
                <div className="mt-3 pt-3 border-t border-eden-border/50">
                  <AnswerProgress
                    answered={questionStats.answered}
                    total={questionStats.total}
                  />
                </div>
              )}
            </div>

            {/* Response area */}
            <div className="flex-1 px-6 py-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-eden-text-2 uppercase tracking-wider">
                  Response
                </label>
                <span
                  className={`text-[10px] font-medium ${
                    saveStatus === 'saved'
                      ? 'text-emerald-600'
                      : saveStatus === 'saving'
                        ? 'text-amber-600'
                        : 'text-transparent'
                  }`}
                >
                  {saveStatus === 'saved'
                    ? 'Saved'
                    : saveStatus === 'saving'
                      ? 'Saving...'
                      : '.'}
                </span>
              </div>
              <div className="relative">
                {isMentionOpen && (
                  <MentionDropdown
                    dropdownId={dropdownId}
                    items={filteredMentions}
                    highlightedIndex={highlightedIndex}
                    onHover={setHighlightedIndex}
                    onSelect={insertMention}
                  />
                )}
                <textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={handleInputChange}
                  onKeyDown={handleMentionKeyDown}
                  onClick={handleCaretChange}
                  onKeyUp={handleCaretChange}
                  onSelect={handleCaretChange}
                  placeholder="Type your answer. Use @mentions to reference related items."
                  rows={6}
                  className="w-full resize-y rounded-xl border border-eden-border bg-eden-bg px-4 py-3
                             text-sm text-eden-text placeholder:text-eden-text-2/40
                             focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent"
                  {...ariaProps}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-eden-border flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-eden-bg text-eden-text
                           hover:bg-eden-border transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleEvolve}
                disabled={evolving || !answer.trim() || detail.status !== 'open'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                           bg-eden-accent text-white hover:bg-eden-accent/90 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="evolve-btn"
              >
                <EvolveIcon className="w-4 h-4" />
                {evolving ? 'Evolving...' : 'Evolve Map'}
              </button>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-sm text-red-600">
            Failed to load question
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400]"
          data-testid="toast"
        >
          <div className="bg-eden-text text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

function EvolveIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
