import type { Persona } from './types';

// ---------------------------------------------------------------------------
// RoleFilterPills — client-side persona highlight/dim filter
//
// Unlike PersonaTabs (which re-fetches from the API), these pills apply a
// purely visual filter: non-matching tasks dim to 12% opacity. This lets
// users quickly scan the full grid for a specific persona's tasks without
// losing the structural context of activities and steps.
//
// Visual spec:
//   - Pill border: 2px solid <persona-color>, border-radius: 20px
//   - Inactive: transparent bg, persona-colored text + border
//   - Active: filled bg in persona color, white text
//   - Hover: slight lift (translateY(-1px))
//   - Single-select (one pill active at a time)
// ---------------------------------------------------------------------------

interface RoleFilterPillsProps {
  personas: Persona[];
  active: string | null; // null = no highlight (show all equally)
  onToggle: (personaCode: string | null) => void;
}

export function RoleFilterPills({
  personas,
  active,
  onToggle,
}: RoleFilterPillsProps) {
  if (personas.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingLeft: '24px',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#6b7280',
          marginRight: '-2px',
          flexShrink: 0,
        }}
      >
        Highlight:
      </span>

      {personas.map((p) => {
        const isActive = active === p.code;
        return (
          <button
            key={p.id}
            onClick={() => onToggle(isActive ? null : p.code)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
              transition-all duration-150 hover:-translate-y-px"
            style={{
              borderRadius: '20px',
              border: `2px solid ${p.color}`,
              backgroundColor: isActive ? p.color : 'transparent',
              color: isActive ? '#fff' : p.color,
            }}
          >
            {!isActive && (
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
            )}
            {p.code}
          </button>
        );
      })}

      {active && (
        <button
          onClick={() => onToggle(null)}
          className="text-xs text-eden-text-2 hover:text-eden-text transition-colors ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
