import type { MapStats, Persona } from './types';

// ---------------------------------------------------------------------------
// MapLegend — sticky stats bar showing aggregate counts + persona legend
// ---------------------------------------------------------------------------

interface MapLegendProps {
  stats: MapStats;
  personas: Persona[];
}

export function MapLegend({ stats, personas }: MapLegendProps) {
  return (
    <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur border-t border-eden-border px-4 py-2.5">
      <div className="flex items-center justify-between gap-4 text-xs">
        {/* Aggregate stats */}
        <div className="flex items-center gap-4 text-eden-text-2">
          <Stat label="activities" count={stats.activity_count} />
          <Stat label="steps" count={stats.step_count} />
          <Stat label="tasks" count={stats.task_count} />
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-eden-text">
              {stats.question_count}
            </span>
            <span>
              questions
              {stats.question_count > 0 && (
                <span className="text-eden-green ml-1">
                  ({stats.answered_question_count} answered)
                </span>
              )}
            </span>
          </span>
        </div>

        {/* Persona color legend */}
        {personas.length > 0 && (
          <div className="flex items-center gap-3 flex-shrink-0">
            {personas.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-eden-text-2">{p.name}</span>
                {stats.persona_counts[p.code] != null && (
                  <span className="text-eden-text font-medium">
                    ({stats.persona_counts[p.code]})
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-semibold text-eden-text">{count}</span>
      <span>{count === 1 ? label.replace(/s$/, '') : label}</span>
    </span>
  );
}
