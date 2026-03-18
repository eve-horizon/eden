import { useCallback, useEffect, useRef, useState } from 'react';
import type { Activity } from './types';

// ---------------------------------------------------------------------------
// ActivityFilterBar — sticky bar for filtering visible activities
//
// Shows a dropdown with checkboxes for each activity, plus "Select All".
// Selected activities appear as dark pills next to the dropdown trigger.
// ---------------------------------------------------------------------------

interface ActivityFilterBarProps {
  activities: Activity[];
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export function ActivityFilterBar({
  activities,
  selected,
  onSelectionChange,
}: ActivityFilterBarProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allSelected = selected.size === activities.length;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(activities.map((a) => a.id)));
    }
  }, [allSelected, activities, onSelectionChange]);

  const toggleActivity = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange(next);
    },
    [selected, onSelectionChange],
  );

  // Selected activities for pill display (preserving activity order)
  const selectedActivities = activities.filter((a) => selected.has(a.id));

  if (activities.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
          flexShrink: 0,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.3px',
        }}
      >
        Activity:
      </span>

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          style={{
            padding: '8px 14px',
            border: open ? '1px solid #e65100' : '1px solid #e2e5e9',
            background: open ? 'rgba(230,81,0,0.05)' : '#fff',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
            color: open ? '#e65100' : '#6b7280',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => {
            if (!open) {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
            }
          }}
          onMouseLeave={(e) => {
            if (!open) {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.borderColor = '#e2e5e9';
            }
          }}
        >
          {allSelected ? 'All activities' : `${selected.size} of ${activities.length}`}
          <DropdownChevron
            className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute left-0 top-full mt-1 z-40 w-72 bg-white rounded-lg shadow-lg border border-eden-border py-1">
            {/* Select All */}
            <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-gray-300 text-eden-accent focus:ring-eden-accent"
              />
              <span className="text-xs font-semibold text-eden-text">
                Select All
              </span>
            </label>

            <div className="border-t border-gray-100 my-1" />

            {/* Per-activity checkboxes */}
            {activities.map((a) => (
              <label
                key={a.id}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggleActivity(a.id)}
                  className="rounded border-gray-300 text-eden-accent focus:ring-eden-accent"
                />
                <span className="text-xs text-eden-text truncate">
                  <span className="font-mono text-eden-text-2 mr-1.5">
                    {a.display_id}
                  </span>
                  {a.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Selected activity pills */}
      {!allSelected && selectedActivities.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedActivities.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-eden-activity text-white text-[10px] font-medium"
            >
              {a.display_id}
              <button
                onClick={() => toggleActivity(a.id)}
                className="hover:text-white/60 transition-colors"
                aria-label={`Remove ${a.name} filter`}
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function DropdownChevron({ className }: { className?: string }) {
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z" />
    </svg>
  );
}
