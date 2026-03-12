import { useState } from 'react';
import type { AcceptanceCriterion, Question } from './types';

// ---------------------------------------------------------------------------
// TaskCardExpanded — expanded detail view rendered inline below TaskCard
//
// Shows the user story, acceptance criteria checklist (read-only in Phase 1),
// and question pills with hover tooltips.
// ---------------------------------------------------------------------------

interface TaskCardExpandedProps {
  userStory: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  questions: Question[];
}

export function TaskCardExpanded({
  userStory,
  acceptanceCriteria,
  questions,
}: TaskCardExpandedProps) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      {/* User story */}
      {userStory && (
        <div className="border-l-2 border-eden-accent pl-3 py-1">
          <p className="text-xs font-medium text-eden-text-2 mb-1">
            User Story
          </p>
          <p className="text-sm text-eden-text leading-relaxed">{userStory}</p>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptanceCriteria.length > 0 && (
        <div>
          <p className="text-xs font-medium text-eden-text-2 mb-1.5">
            Acceptance Criteria
          </p>
          <ul className="space-y-1">
            {acceptanceCriteria.map((ac, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
                    ${
                      ac.done
                        ? 'bg-eden-green border-eden-green text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                >
                  {ac.done && <CheckIcon className="w-2.5 h-2.5" />}
                </span>
                <span
                  className={
                    ac.done
                      ? 'text-eden-text-2 line-through'
                      : 'text-eden-text'
                  }
                >
                  {ac.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-eden-text-2 mb-1.5">
            Questions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q) => (
              <QuestionPill key={q.id} question={q} />
            ))}
          </div>
        </div>
      )}

      {/* Empty expanded state */}
      {!userStory &&
        acceptanceCriteria.length === 0 &&
        questions.length === 0 && (
          <p className="text-xs text-eden-text-2 italic">
            No additional details yet.
          </p>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionPill — shows display_id with hover tooltip for full question text
// ---------------------------------------------------------------------------

function QuestionPill({ question: q }: { question: Question }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const statusColor =
    q.status === 'resolved'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : q.status === 'answered'
        ? 'bg-blue-50 border-blue-200 text-blue-700'
        : 'bg-eden-q-bg border-eden-q-border text-eden-q-text';

  return (
    <span
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
          border cursor-default ${statusColor}`}
      >
        <QuestionMarkIcon className="w-3 h-3" />
        {q.display_id}
      </span>

      {showTooltip && (
        <span
          className="absolute left-0 bottom-full mb-1.5 z-50
            w-64 px-3 py-2 rounded-lg bg-eden-activity text-white text-xs
            leading-relaxed shadow-modal pointer-events-none"
        >
          <span className="font-medium block mb-0.5">{q.display_id}</span>
          {q.question}
          <span
            className="absolute left-4 top-full w-0 h-0
              border-l-[5px] border-l-transparent
              border-r-[5px] border-r-transparent
              border-t-[5px] border-t-eden-activity"
          />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

function QuestionMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.5 10.5a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM8 4.5A1.75 1.75 0 006.25 6.25a.5.5 0 01-1 0A2.75 2.75 0 118 9a.5.5 0 01-.5-.5V7.25a.5.5 0 011 0v.838A1.75 1.75 0 008 4.5z" />
    </svg>
  );
}
