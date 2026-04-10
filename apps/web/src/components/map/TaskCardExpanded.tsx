import type { AcceptanceCriterion, Question } from './types';

// ---------------------------------------------------------------------------
// TaskCardExpanded — expanded detail view rendered inline below TaskCard
//
// Matches prototype layout exactly:
//   - User story: background block with accent left border, US-{id} label
//   - Acceptance criteria: AC-IDs + green checkmarks + small text
//   - Questions: Full q-pill cards with text, priority, answer status
// ---------------------------------------------------------------------------

interface TaskCardExpandedProps {
  taskDisplayId: string;
  userStory: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  questions: Question[];
  onQuestionClick?: (questionId: string) => void;
}

// Generate AC display ID from task display_id: TSK-1.1.1 → AC-1.1.1a
function fallbackAcDisplayId(taskDisplayId: string, index: number): string {
  const nums = taskDisplayId.replace(/^TSK-/, '');
  const letter = String.fromCharCode(97 + index); // a, b, c...
  return `AC-${nums}${letter}`;
}

// Extract user story display ID: TSK-1.1.1 → US-1.1.1
function usDisplayId(taskDisplayId: string): string {
  const nums = taskDisplayId.replace(/^TSK-/, '');
  return `US-${nums}`;
}

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  high:   { bg: '#fee2e2', color: '#dc2626' },
  medium: { bg: '#fef3c7', color: '#d97706' },
  low:    { bg: '#d1fae5', color: '#059669' },
};

export function TaskCardExpanded({
  taskDisplayId,
  userStory,
  acceptanceCriteria,
  questions,
  onQuestionClick,
}: TaskCardExpandedProps) {
  const openQuestions = questions.filter((q) => q.status !== 'resolved');

  return (
    <div style={{ fontSize: '11px' }}>
      {/* User story */}
      {userStory && (
        <div
          data-testid={`user-story-${taskDisplayId}`}
          style={{
            background: '#f8fafc',
            borderLeft: '3px solid #e65100',
            borderRadius: '0 8px 8px 0',
            padding: '8px 10px',
            marginBottom: '6px',
          }}
        >
          <div
            style={{
              fontSize: '8px',
              fontWeight: 800,
              color: '#e65100',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '3px',
            }}
          >
            {usDisplayId(taskDisplayId)} — USER STORY
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#1a1a2e',
              fontStyle: 'italic',
              lineHeight: 1.6,
            }}
          >
            {userStory}
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {acceptanceCriteria.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          {acceptanceCriteria.map((ac, i) => (
            (() => {
              const displayId = ac.id ?? fallbackAcDisplayId(taskDisplayId, i);
              const isRequirement = ac.done !== false;

              return (
                <div
                  key={displayId}
                  data-testid={`acceptance-criterion-${displayId}`}
                  style={{
                    display: 'flex',
                    gap: '5px',
                    alignItems: 'flex-start',
                    marginBottom: '4px',
                    fontSize: '9px',
                    color: '#6b7280',
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    style={{
                      color: isRequirement ? '#10b981' : '#f59e0b',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {isRequirement ? '✓' : '•'}
                  </span>
                  <span
                    style={{
                      fontSize: '7px',
                      fontWeight: 700,
                      color: '#e65100',
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  >
                    {displayId}
                  </span>
                  <span>{ac.text}</span>
                </div>
              );
            })()
          ))}
        </div>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <div
          style={{
            marginTop: '8px',
            borderTop: '1px solid #eee',
            paddingTop: '6px',
          }}
        >
          <div
            style={{
              fontSize: '8px',
              fontWeight: 800,
              color: '#92400e',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}
          >
            ⚠ OPEN QUESTIONS ({openQuestions.length})
          </div>
          {questions.map((q) => {
            const isAnswered =
              q.status === 'resolved' ||
              (q.answer != null && q.answer.trim() !== '');
            const priStyle = PRIORITY_STYLES[q.priority] ?? { bg: '#fef3c7', color: '#d97706' };

            return (
              <div
                key={q.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuestionClick?.(q.id);
                }}
                style={{
                  background: isAnswered ? '#ecfdf5' : '#fffbeb',
                  border: `1px solid ${isAnswered ? '#10b981' : '#f59e0b'}`,
                  borderRadius: '6px',
                  padding: '5px 8px',
                  marginBottom: '4px',
                  fontSize: '9px',
                  lineHeight: 1.5,
                  color: '#92400e',
                  display: 'flex',
                  gap: '5px',
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    '0 2px 8px rgba(245,158,11,.2)';
                  (e.currentTarget as HTMLElement).style.transform =
                    'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '';
                  (e.currentTarget as HTMLElement).style.transform = '';
                }}
              >
                <span
                  style={{
                    fontSize: '7px',
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: '1px',
                  }}
                >
                  {q.display_id}
                </span>
                <span style={{ flex: 1 }}>{q.question}</span>
                <span
                  style={{
                    fontSize: '7px',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '3px',
                    flexShrink: 0,
                    marginTop: '1px',
                    background: priStyle.bg,
                    color: priStyle.color,
                  }}
                >
                  {q.priority}
                </span>
                {isAnswered && (
                  <span
                    style={{
                      color: '#10b981',
                      fontWeight: 800,
                      fontSize: '10px',
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty expanded state */}
      {!userStory &&
        acceptanceCriteria.length === 0 &&
        questions.length === 0 && (
          <p
            style={{
              fontSize: '10px',
              color: '#6b7280',
              fontStyle: 'italic',
              marginTop: '4px',
            }}
          >
            No additional details yet.
          </p>
        )}
    </div>
  );
}
