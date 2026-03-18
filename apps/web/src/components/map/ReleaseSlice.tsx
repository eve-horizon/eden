import { useState } from 'react';

// ---------------------------------------------------------------------------
// ReleaseSlice — single horizontal band showing one release and its tasks.
//
// Collapsible header with release name + task count. Body shows task pills
// in a flowing layout. Inline rename on double-click (owner/editor only).
// ---------------------------------------------------------------------------

interface ReleaseTask {
  id: string;
  display_id: string;
  title: string;
  priority: string | null;
  persona_color: string | null;
}

interface ReleaseSliceProps {
  id: string;
  name: string;
  status: string;
  targetDate: string | null;
  tasks: ReleaseTask[];
  canEdit: boolean;
  onRename?: (id: string, name: string) => Promise<void>;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  planning: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
  active:   { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  released: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
};

const PRIORITY_DOT: Record<string, string> = {
  must:   '#ef4444',
  should: '#f59e0b',
  could:  '#3b82f6',
  wont:   '#9ca3af',
};

export function ReleaseSlice({
  id,
  name,
  status,
  targetDate,
  tasks,
  canEdit,
  onRename,
}: ReleaseSliceProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  const defaultColor = { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
  const sc = STATUS_COLORS[status] ?? defaultColor;

  const handleSave = async () => {
    if (!editValue.trim() || editValue.trim() === name) {
      setEditing(false);
      setEditValue(name);
      return;
    }
    try {
      await onRename?.(id, editValue.trim());
      setEditing(false);
    } catch {
      setEditValue(name);
      setEditing(false);
    }
  };

  return (
    <div
      className="border border-eden-border rounded-lg overflow-hidden bg-white"
      data-testid={`release-slice-${id}`}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        onDoubleClick={(e) => {
          if (canEdit && onRename) {
            e.preventDefault();
            setEditing(true);
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-eden-bg/30"
        style={{ borderLeft: `4px solid ${sc.border}` }}
      >
        <ChevronIcon
          className="w-4 h-4 text-eden-text-2 flex-shrink-0 transition-transform"
          style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}
        />

        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setEditing(false);
                setEditValue(name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 px-2 py-0.5 rounded border border-eden-accent text-sm font-semibold
                       text-eden-text outline-none"
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-eden-text truncate">
            {name}
          </span>
        )}

        <span
          className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
          style={{ background: sc.bg, color: sc.text }}
        >
          {status}
        </span>

        {targetDate && (
          <span className="flex-shrink-0 text-[10px] text-eden-text-2">
            {formatDate(targetDate)}
          </span>
        )}

        <span className="flex-shrink-0 text-[10px] font-medium text-eden-text-2 bg-eden-bg px-1.5 py-0.5 rounded">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Task pills */}
      {!collapsed && tasks.length > 0 && (
        <div className="px-4 py-3 border-t border-eden-border/50 flex flex-wrap gap-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-eden-bg
                         border border-eden-border text-xs"
              title={task.title}
            >
              {task.priority && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: PRIORITY_DOT[task.priority] ?? '#9ca3af' }}
                />
              )}
              {task.persona_color && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: task.persona_color }}
                />
              )}
              <span className="font-mono text-[10px] text-eden-text-2 flex-shrink-0">
                {task.display_id}
              </span>
              <span className="text-eden-text truncate max-w-[180px]">
                {task.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {!collapsed && tasks.length === 0 && (
        <div className="px-4 py-3 border-t border-eden-border/50">
          <p className="text-xs text-eden-text-2 italic">No tasks in this release.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function ChevronIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
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
