import { useState } from 'react';
import type { Task } from './types';
import { TaskCardExpanded } from './TaskCardExpanded';

// ---------------------------------------------------------------------------
// TaskCard — compact card for a single task within a step column
//
// White card with persona-colored left border. Shows persona badge, title,
// priority/status pills, and question count. Clicking the chevron expands
// to show TaskCardExpanded inline below.
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: Task;
  /** When true, dim the card to 15% opacity (role filter is active and this
   *  task doesn't match the highlighted persona). */
  dimmed: boolean;
}

// Priority pill colors
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  critical: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
};

// Status pill colors
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700',
};

export function TaskCard({ task, dimmed }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const personaColor = task.persona?.color ?? '#9ca3af';
  const priorityStyle =
    PRIORITY_COLORS[task.priority] ?? 'bg-gray-100 text-gray-600';
  const statusStyle =
    STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600';
  const openQuestions = task.questions.filter(
    (q) => q.status !== 'resolved',
  ).length;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-150"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: personaColor,
        opacity: dimmed ? 0.15 : 1,
      }}
    >
      {/* Compact view */}
      <div className="px-3 py-2.5">
        {/* Top row: persona badge + chevron */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {task.persona && (
              <span
                className="inline-flex items-center justify-center flex-shrink-0
                  w-6 h-6 rounded-md text-[10px] font-bold text-white uppercase"
                style={{ backgroundColor: task.persona.color }}
                title={task.persona.name}
              >
                {task.persona.code.slice(0, 2)}
              </span>
            )}
            <span className="text-[10px] font-mono text-eden-text-2 flex-shrink-0">
              {task.display_id}
            </span>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors text-eden-text-2"
            aria-label={expanded ? 'Collapse task' : 'Expand task'}
          >
            <ChevronIcon
              className={`w-4 h-4 transition-transform duration-150 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium text-eden-text leading-snug mb-2">
          {task.title}
        </h4>

        {/* Pills row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${priorityStyle}`}
          >
            {task.priority}
          </span>
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${statusStyle}`}
          >
            {task.status}
          </span>
          {openQuestions > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-eden-q-bg text-eden-q-text">
              <QuestionIcon className="w-3 h-3" />
              {openQuestions}
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3">
          <TaskCardExpanded
            userStory={task.user_story}
            acceptanceCriteria={task.acceptance_criteria}
            questions={task.questions}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

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
        d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function QuestionIcon({ className }: { className?: string }) {
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
