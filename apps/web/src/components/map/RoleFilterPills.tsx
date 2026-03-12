import type { Persona } from './types';

// ---------------------------------------------------------------------------
// RoleFilterPills — client-side persona highlight/dim filter
//
// Unlike PersonaTabs (which re-fetches from the API), these pills apply a
// purely visual filter: non-matching tasks dim to 15% opacity. This lets
// users quickly scan the full grid for a specific persona's tasks without
// losing the structural context of activities and steps.
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
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-xs font-medium text-eden-text-2 mr-1">
        Highlight:
      </span>

      {personas.map((p) => {
        const isActive = active === p.code;
        return (
          <button
            key={p.id}
            onClick={() => onToggle(isActive ? null : p.code)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
              border transition-all duration-150
              ${
                isActive
                  ? 'text-white border-transparent shadow-sm'
                  : 'text-eden-text-2 border-eden-border bg-white hover:border-gray-300'
              }`}
            style={
              isActive
                ? { backgroundColor: p.color, borderColor: p.color }
                : undefined
            }
          >
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color }}
            />
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
