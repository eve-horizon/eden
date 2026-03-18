import { useState } from 'react';
import type { DeduplicatedTask } from './types';
import { TaskCardExpanded } from './TaskCardExpanded';
import { InlineEdit } from './InlineEdit';

// ---------------------------------------------------------------------------
// TaskCard — compact card for a single deduplicated task
//
// Matches prototype layout: title-first (large, bold), then a metadata row
// below with display_id, multiple persona role badges (small colored
// rectangles), source badge, device badge, and question count.
// Card has a 4px left border colored by first persona. Expandable via chevron.
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: DeduplicatedTask;
  dimmed: boolean;
  aiStatus?: 'modified' | 'added' | null;
  onQuestionClick?: (questionId: string) => void;
  forceExpanded?: boolean;
  canEdit?: boolean;
  onRenameTask?: (taskId: string, title: string) => Promise<void>;
  isOwner?: boolean;
  onAskQuestion?: (taskDisplayId: string) => void;
  onApprove?: (taskId: string) => Promise<void>;
  onReject?: (taskId: string) => Promise<void>;
}

// Source badge color map
const SOURCE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  research:    { border: '#6b7280', bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
  transcript:  { border: '#0891b2', bg: 'rgba(8,145,178,0.1)',   text: '#0891b2' },
  'scope-doc': { border: '#7c3aed', bg: 'rgba(124,58,237,0.1)',  text: '#7c3aed' },
  both:        { border: '#059669', bg: 'rgba(5,150,105,0.1)',    text: '#059669' },
  ingestion:   { border: '#6b7280', bg: 'rgba(107,114,128,0.1)', text: '#6b7280' },
};

// Device badge styles
const DEVICE_STYLES: Record<string, { bg: string; color: string }> = {
  desktop: { bg: '#f3f4f6', color: '#6b7280' },
  mobile:  { bg: '#fef3c7', color: '#92400e' },
  all:     { bg: '#e0e7ff', color: '#4338ca' },
};

export function TaskCard({ task, dimmed, aiStatus, onQuestionClick, forceExpanded, canEdit, onRenameTask, isOwner, onAskQuestion, onApprove, onReject }: TaskCardProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded ?? localExpanded;
  const [hovered, setHovered] = useState(false);

  const firstPersona = task.personas[0]?.persona ?? null;
  const personaColor = firstPersona?.color ?? '#9ca3af';
  const lifecycle = task.lifecycle ?? 'current';

  // Check if any placement is a handoff
  const hasHandoff = task.personas.some((p) => p.role_in_journey === 'handoff');

  // --- Border color logic ---
  let borderColor = aiStatus === 'modified' ? '#8b5cf6'
    : aiStatus === 'added' ? '#10b981'
    : personaColor;

  if (lifecycle === 'proposed') borderColor = '#10b981';
  if (lifecycle === 'discontinued') borderColor = '#9ca3af';

  const openQuestions = task.questions.filter(
    (q) => q.status !== 'resolved',
  ).length;

  // --- Card style ---
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e2e5e9',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    cursor: 'pointer',
    borderLeft: `4px solid ${borderColor}`,
    borderLeftStyle: hasHandoff ? 'dashed' : 'solid',
    transition: 'all 0.2s',
  };

  if (expanded) {
    cardStyle.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
  }

  if (hovered && !dimmed) {
    cardStyle.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    cardStyle.transform = 'translateY(-1px)';
  }

  if (dimmed) {
    cardStyle.opacity = 0.12;
    cardStyle.transform = 'scale(0.97)';
    cardStyle.pointerEvents = 'none';
  } else if (lifecycle === 'discontinued') {
    cardStyle.opacity = 0.45;
    cardStyle.background = '#f9fafb';
  } else if (lifecycle === 'proposed') {
    cardStyle.background = 'linear-gradient(135deg, #f0fdf4, #fff)';
  } else if (hasHandoff) {
    cardStyle.opacity = 0.85;
    cardStyle.background = '#fafafa';
    cardStyle.border = '2px dashed #d1d5db';
    cardStyle.borderLeft = `4px dashed #d1d5db`;
  }

  return (
    <div
      style={cardStyle}
      data-testid={`task-card-${task.display_id}`}
      data-display-id={task.display_id}
      data-approval={task.approval}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => forceExpanded === undefined && setLocalExpanded(!localExpanded)}
    >
      <div style={{ padding: '10px 14px 8px' }}>
        {/* Title row — title first, large and clear */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
          <h4
            style={{
              fontSize: '13px',
              fontWeight: 700,
              flex: 1,
              lineHeight: 1.35,
              minWidth: 0,
              color: lifecycle === 'discontinued' ? '#9ca3af' : '#1a1a2e',
              textDecoration: lifecycle === 'discontinued' ? 'line-through' : undefined,
              margin: 0,
            }}
          >
            {onRenameTask ? (
              <InlineEdit
                value={task.title}
                onSave={(title) => onRenameTask(task.id, title)}
                disabled={!canEdit}
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  lineHeight: 1.35,
                  color: lifecycle === 'discontinued' ? '#9ca3af' : '#1a1a2e',
                  textDecoration: lifecycle === 'discontinued' ? 'line-through' : undefined,
                }}
              />
            ) : (
              task.title
            )}
          </h4>

          <span
            style={{
              fontSize: '10px',
              color: '#6b7280',
              flexShrink: 0,
              marginTop: '3px',
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(180deg)' : undefined,
            }}
            aria-hidden="true"
          >
            <ChevronIcon className="w-4 h-4" />
          </span>
        </div>

        {/* Quick actions — visible on hover for editors/owners */}
        {hovered && !dimmed && (canEdit || isOwner) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
            }}
          >
            {canEdit && onAskQuestion && (
              <QuickActionButton
                label="Ask Question"
                onClick={(e) => { e.stopPropagation(); onAskQuestion(task.display_id); }}
                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #f59e0b' }}
              >
                ?
              </QuickActionButton>
            )}
            {isOwner && task.approval === 'preview' && onApprove && (
              <QuickActionButton
                label="Approve"
                onClick={(e) => { e.stopPropagation(); onApprove(task.id); }}
                style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #10b981' }}
              >
                ✓
              </QuickActionButton>
            )}
            {isOwner && task.approval === 'preview' && onReject && (
              <QuickActionButton
                label="Reject"
                onClick={(e) => { e.stopPropagation(); onReject(task.id); }}
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #ef4444' }}
              >
                ✗
              </QuickActionButton>
            )}
          </div>
        )}

        {/* Metadata row: ID + persona badges + lifecycle + source + device + questions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          {/* Display ID */}
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              color: '#6b7280',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {task.display_id}
          </span>

          {/* Persona role badges — one per unique persona */}
          {task.personas.map((p, i) => (
            <span
              key={`${p.persona.id}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '8px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                letterSpacing: '0.2px',
                color: '#fff',
                padding: '1px 6px',
                borderRadius: '3px',
                backgroundColor: p.persona.color,
              }}
              title={`${p.persona.name} (${p.role})`}
            >
              {p.persona.code}
            </span>
          ))}

          {/* Lifecycle badges */}
          {lifecycle === 'proposed' && (
            <span
              style={{
                fontSize: '7px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '3px',
                letterSpacing: '0.4px',
                background: '#d1fae5',
                color: '#065f46',
                whiteSpace: 'nowrap',
              }}
            >
              2.0 PROPOSED
            </span>
          )}
          {lifecycle === 'discontinued' && (
            <span
              style={{
                fontSize: '7px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '3px',
                letterSpacing: '0.4px',
                background: '#f3f4f6',
                color: '#6b7280',
                textDecoration: 'line-through',
                whiteSpace: 'nowrap',
              }}
            >
              DISCONTINUED
            </span>
          )}

          {/* Pending review badge */}
          {task.approval === 'preview' && (
            <span
              style={{
                fontSize: '7px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '3px',
                letterSpacing: '0.4px',
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #f59e0b',
                whiteSpace: 'nowrap',
              }}
            >
              PENDING REVIEW
            </span>
          )}

          {/* Source badge */}
          {task.source_type != null && (
            <SourceBadge sourceType={task.source_type} />
          )}

          {/* Device badge */}
          {task.device && <DeviceBadge device={task.device} />}

          {/* Open questions badge */}
          {openQuestions > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const firstOpen = task.questions.find((q) => q.status !== 'resolved');
                if (firstOpen) onQuestionClick?.(firstOpen.id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '8px',
                fontWeight: 700,
                background: '#fffbeb',
                color: '#92400e',
                border: '1px solid #f59e0b',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              data-testid="question-pill"
            >
              <QuestionIcon className="w-3 h-3" />
              {openQuestions}
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 12px', fontSize: '11px' }}>
          <TaskCardExpanded
            taskDisplayId={task.display_id}
            userStory={task.user_story}
            acceptanceCriteria={task.acceptance_criteria}
            questions={task.questions}
            onQuestionClick={onQuestionClick}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceBadge
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE_COLOR = { border: '#6b7280', bg: 'rgba(107,114,128,0.1)', text: '#6b7280' };

function SourceBadge({ sourceType }: { sourceType: string }) {
  const src = SOURCE_COLORS[sourceType] ?? DEFAULT_SOURCE_COLOR;
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: '3px',
        color: src.text,
        backgroundColor: src.bg,
        border: `1px solid ${src.border}`,
        whiteSpace: 'nowrap',
        letterSpacing: '0.2px',
        textTransform: 'uppercase',
      }}
    >
      {sourceType}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DeviceBadge
// ---------------------------------------------------------------------------

function DeviceBadge({ device }: { device: string }) {
  const style = DEVICE_STYLES[device] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 600,
        padding: '1px 5px',
        borderRadius: '3px',
        whiteSpace: 'nowrap',
        letterSpacing: '0.2px',
        backgroundColor: style.bg,
        color: style.color,
        textTransform: 'uppercase',
      }}
    >
      {device}
    </span>
  );
}

// ---------------------------------------------------------------------------
// QuickActionButton — small hover-revealed action button
// ---------------------------------------------------------------------------

function QuickActionButton({
  label,
  onClick,
  style,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        fontSize: '9px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '4px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
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
