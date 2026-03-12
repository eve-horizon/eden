import type { Persona } from './types';

// ---------------------------------------------------------------------------
// PersonaTabs — sticky tab bar for server-side persona filtering
//
// "Overview" shows all tasks. Each persona tab re-fetches the map API
// with ?persona=<code>, scoping the entire grid to that persona's tasks.
// ---------------------------------------------------------------------------

interface PersonaTabsProps {
  personas: Persona[];
  active: string | null; // null = overview (all)
  onSelect: (personaCode: string | null) => void;
}

export function PersonaTabs({ personas, active, onSelect }: PersonaTabsProps) {
  return (
    <div className="sticky top-0 z-30 bg-eden-bg border-b border-eden-border">
      <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto eden-scroll">
        {/* Overview tab */}
        <button
          onClick={() => onSelect(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${
              active === null
                ? 'bg-eden-activity text-white'
                : 'text-eden-text-2 hover:bg-white hover:text-eden-text'
            }`}
        >
          Overview
        </button>

        {/* Per-persona tabs */}
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.code)}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${
                active === p.code
                  ? 'text-white'
                  : 'text-eden-text-2 hover:bg-white hover:text-eden-text'
              }`}
            style={
              active === p.code
                ? { backgroundColor: p.color }
                : undefined
            }
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: p.color }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
