import type { Activity, Persona } from './types';

// ---------------------------------------------------------------------------
// ActivityRow — dark header band spanning all step columns
//
// Shows the activity display_id and name, plus small persona pills
// indicating which personas have tasks in this activity.
// ---------------------------------------------------------------------------

interface ActivityRowProps {
  activity: Activity;
  stepCount: number;
}

export function ActivityRow({ activity, stepCount }: ActivityRowProps) {
  // Collect unique personas that have tasks within this activity
  const personaMap = new Map<string, Persona>();
  for (const step of activity.steps) {
    for (const task of step.tasks) {
      if (task.persona && !personaMap.has(task.persona.id)) {
        personaMap.set(task.persona.id, task.persona);
      }
    }
  }
  const personas = Array.from(personaMap.values());

  return (
    <div
      className="bg-eden-activity rounded-lg px-4 py-3 flex items-center gap-3"
      style={{
        gridColumn: `1 / ${stepCount + 1}`,
      }}
    >
      <span className="text-xs font-mono text-white/50">
        {activity.display_id}
      </span>
      <h2 className="text-sm font-bold text-white tracking-wide">
        {activity.name}
      </h2>

      {/* Persona pills */}
      {personas.length > 0 && (
        <div className="flex items-center gap-1 ml-auto">
          {personas.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white/90"
              style={{ backgroundColor: `${p.color}88` }}
              title={p.name}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: p.color }}
              />
              {p.code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
