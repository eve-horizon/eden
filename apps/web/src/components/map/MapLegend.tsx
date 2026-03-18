import type { MapStats, Persona } from './types';

// ---------------------------------------------------------------------------
// MapLegend — bottom stats bar matching prototype aggregate display
//
// Shows aggregate counts + persona color dots with task counts.
// Includes answer progress when questions exist.
// ---------------------------------------------------------------------------

interface MapLegendProps {
  stats: MapStats;
  personas: Persona[];
}

export function MapLegend({ stats, personas }: MapLegendProps) {
  const pct = stats.question_count > 0
    ? Math.round((stats.answered_question_count / stats.question_count) * 100)
    : 0;

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 30,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(4px)',
        borderTop: '1px solid #e2e5e9',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        fontSize: '11px',
        color: '#6b7280',
      }}
    >
      {/* Left: Aggregate stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Stat count={stats.activity_count} label="activities" />
        <Stat count={stats.step_count} label="steps" />
        <Stat count={stats.task_count} label="tasks" />
        {stats.question_count > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 600, color: '#1a1a2e' }}>
              {stats.answered_question_count}/{stats.question_count}
            </span>
            <span>answered</span>
            <div
              style={{
                width: '50px',
                height: '4px',
                background: '#e2e5e9',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: '#10b981',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
        ) : (
          <span>
            <span style={{ fontWeight: 600, color: '#1a1a2e' }}>0</span> questions
          </span>
        )}
      </div>

      {/* Right: Persona legend with counts */}
      {personas.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {personas.map((p) => (
            <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: p.color,
                  flexShrink: 0,
                }}
              />
              <span>{p.name}</span>
              {stats.persona_counts[p.code] != null && (
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>
                  ({stats.persona_counts[p.code]})
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ count, label }: { count: number; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{count}</span>
      <span>{count === 1 ? label.replace(/s$/, '') : label}</span>
    </span>
  );
}
