import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { MapResponse, Activity, Persona, Task, DeduplicatedTask } from './types';
import { StepHeader } from './StepHeader';
import { TaskCard } from './TaskCard';
import { MiniMap } from './MiniMap';
import { InlineEdit } from './InlineEdit';
import { useDragDrop } from '../../hooks/useDragDrop';
import { useProjectRole } from '../../hooks/useProjectRole';

// ---------------------------------------------------------------------------
// StoryMap — main component
//
// Fetches the map API, manages persona tab (server-side) and role highlight
// (client-side) filters, activity filter, lifecycle toggle, and mini-map.
//
// Grid layout (matches Ade's prototype):
//   - Columns = ALL steps across ALL activities flowing horizontally
//   - Row 1: Activity headers (each spanning its own steps' columns)
//   - Row 2: Step headers (one per column)
//   - Row 3: Task cells (one per column, vertically stacking cards)
// ---------------------------------------------------------------------------

interface MapStats {
  activity_count: number;
  step_count: number;
  task_count: number;
  acceptance_criteria_count: number;
  question_count: number;
  answered_question_count: number;
  persona_counts: Record<string, number>;
}

interface StoryMapProps {
  aiModifiedEntities?: Set<string>;
  aiAddedEntities?: Set<string>;
  onQuestionClick?: (questionId: string) => void;
  hideProposed?: boolean;
  selectedActivities?: Set<string>;
  roleHighlight?: string | null;
  onHideProposedChange?: (value: boolean) => void;
  expandAll?: boolean;
  questionsOnly?: boolean;
  /** Callback when map data loads — passes stats, activities, personas for toolbar display */
  onDataReady?: (data: {
    map: MapResponse;
    stats: MapStats;
    activities: { id: string; display_id: string; name: string }[];
    personas: { id: string; code: string; name: string; color: string }[];
  }) => void;
}

export function StoryMap({
  aiModifiedEntities,
  aiAddedEntities,
  onQuestionClick,
  hideProposed = false,
  selectedActivities = new Set<string>(),
  roleHighlight = null,
  expandAll = false,
  questionsOnly = false,
  onDataReady,
}: StoryMapProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();

  // Server-side persona filter (re-fetches API)
  const personaTab = searchParams.get('persona');
  const releaseFilter = searchParams.get('release');

  // Mini-map collapsed state
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(false);

  // Scrollable grid container ref (for MiniMap navigation)
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Data state
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Role-based editing
  const { canEdit } = useProjectRole(projectId);

  const fetchMap = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (personaTab) params.set('persona', personaTab);
      if (releaseFilter) params.set('release', releaseFilter);
      const qs = params.toString();
      const resp = await api.get<MapResponse>(
        `/projects/${projectId}/map${qs ? `?${qs}` : ''}`,
      );
      setData(resp);
      onDataReady?.({
        map: resp,
        stats: resp.stats,
        activities: resp.activities.map(a => ({ id: a.id, display_id: a.display_id, name: a.name })),
        personas: resp.personas.map(p => ({ id: p.id, code: p.code, name: p.name, color: p.color })),
      });

      // Activity selection not managed here — all activities shown by default
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }, [projectId, personaTab, releaseFilter]);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  // Drag-and-drop
  const drag = useDragDrop({
    projectId: projectId!,
    onMoveComplete: fetchMap,
  });

  // Inline rename handlers
  const handleRenameActivity = useCallback(async (activityId: string, name: string) => {
    await api.patch(`/activities/${activityId}`, { name });
    fetchMap();
  }, [fetchMap]);

  const handleRenameStep = useCallback(async (stepId: string, name: string) => {
    await api.patch(`/steps/${stepId}`, { name });
    fetchMap();
  }, [fetchMap]);

  const handleRenameTask = useCallback(async (taskId: string, title: string) => {
    await api.patch(`/tasks/${taskId}`, { title });
    fetchMap();
  }, [fetchMap]);

  // ---------- Loading state ----------
  if (loading && !data) {
    return <MapSkeleton />;
  }

  // ---------- Error state ----------
  if (error && !data) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Build column template: each step gets a minmax(280px, 1fr) column
  const colTemplate = data.activities
    .map((a) =>
      (a.steps.length > 0 ? a.steps : [null])
        .map(() => 'minmax(280px, 1fr)')
        .join(' '),
    )
    .join(' ');

  // Build per-activity column offsets for grid placement
  let colOffset = 1;
  const activityColumns: { start: number; span: number }[] = [];
  for (const activity of data.activities) {
    const span = Math.max(activity.steps.length, 1);
    activityColumns.push({ start: colOffset, span });
    colOffset += span;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="story-map">
      {/* Loading overlay for re-fetches */}
      {loading && (
        <div className="px-4 py-1">
          <div className="h-0.5 bg-eden-accent/20 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-eden-accent rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* Scrollable grid area */}
      <div
        ref={gridContainerRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto eden-scroll p-6 pb-32"
        style={{ backgroundColor: '#f0f2f5' }}
      >
        {data.activities.length === 0 ? (
          <EmptyMap />
        ) : (
          <div
            className="story-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: colTemplate,
              gridTemplateRows: 'auto auto 1fr',
              gap: 0,
              minWidth: 'fit-content',
              minHeight: 0,
            }}
          >
            {/* ROW 1: Activity headers — each spans its own steps' columns */}
            {data.activities.map((activity, actIdx) => {
              const { start, span } = activityColumns[actIdx]!;
              const isDimmed =
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return (
                <ActivityHeader
                  key={`act-${activity.id}`}
                  activity={activity}
                  gridColumn={`${start} / span ${span}`}
                  dimmed={isDimmed}
                  isLast={actIdx === data.activities.length - 1}
                  canEdit={canEdit}
                  onRename={handleRenameActivity}
                  isDropTarget={drag.dropTarget === `act-${activity.id}`}
                  draggable={canEdit}
                  onDragStart={(e) => drag.handleDragStart(e, { type: 'activity', id: activity.id })}
                  onDragEnd={drag.handleDragEnd}
                  onDragOver={(e) => drag.handleDragOver(e, `act-${activity.id}`)}
                  onDragLeave={drag.handleDragLeave}
                  onDrop={(e) => drag.handleActivityDrop(e, actIdx, data.activities.map(a => a.id))}
                />
              );
            })}

            {/* ROW 2: Step headers — one per column */}
            {data.activities.map((activity) => {
              const isDimmed =
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return activity.steps.map((step) => {
                const primaryPersonaColor = step.tasks[0]?.persona?.color ?? null;
                return (
                  <div
                    key={`stp-${step.id}`}
                    draggable={canEdit}
                    onDragStart={(e) => drag.handleDragStart(e, {
                      type: 'step',
                      id: step.id,
                      sourceActivityId: activity.id,
                    })}
                    onDragEnd={drag.handleDragEnd}
                    onDragOver={(e) => drag.handleDragOver(e, `stp-${step.id}`)}
                    onDragLeave={drag.handleDragLeave}
                    onDrop={(e) => drag.handleStepDrop(e, activity.id)}
                    style={{
                      gridRow: 2,
                      opacity: isDimmed ? 0.1 : 1,
                      pointerEvents: isDimmed ? 'none' : undefined,
                      outline: drag.dropTarget === `stp-${step.id}` ? '2px dashed #3b82f6' : undefined,
                      cursor: canEdit ? 'grab' : undefined,
                    }}
                  >
                    <StepHeader
                      step={step}
                      primaryPersonaColor={primaryPersonaColor}
                      canEdit={canEdit}
                      onRename={handleRenameStep}
                    />
                  </div>
                );
              });
            })}

            {/* ROW 3: Task cells — one per column, tasks deduplicated */}
            {data.activities.map((activity) => {
              const isDimmed =
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return activity.steps.map((step) => {
                let filteredTasks = hideProposed
                  ? step.tasks.filter((t) => (t.lifecycle ?? 'current') !== 'proposed')
                  : step.tasks;

                // Deduplicate: group placements of the same task into one card
                let deduped = deduplicateTasks(filteredTasks);

                // Questions-only filter: only show tasks that have open questions
                if (questionsOnly) {
                  deduped = deduped.filter(
                    (t) => t.questions.some((q) => q.status !== 'resolved'),
                  );
                }

                return (
                  <div
                    key={`tasks-${step.id}`}
                    className="task-cell"
                    onDragOver={(e) => drag.handleDragOver(e, `tasks-${step.id}`)}
                    onDragLeave={drag.handleDragLeave}
                    onDrop={(e) => drag.handleTaskDrop(e, step.id)}
                    style={{
                      gridRow: 3,
                      padding: '10px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      borderRight: '1px dashed #d1d5db',
                      background: drag.dropTarget === `tasks-${step.id}` ? '#e0f2fe' : '#f0f2f5',
                      minHeight: '120px',
                      opacity: isDimmed ? 0.1 : 1,
                      pointerEvents: isDimmed ? 'none' : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    {deduped.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
                        <p className="text-xs text-eden-text-2 italic">No tasks</p>
                      </div>
                    ) : (
                      deduped.map((task) => (
                        <div
                          key={task.id}
                          draggable={canEdit}
                          onDragStart={(e) => drag.handleDragStart(e, {
                            type: 'task',
                            id: task.id,
                            sourceStepId: step.id,
                          })}
                          onDragEnd={drag.handleDragEnd}
                          style={{ cursor: canEdit ? 'grab' : undefined }}
                        >
                          <TaskCard
                            task={task}
                            dimmed={
                              roleHighlight !== null &&
                              !task.personas.some((p) => p.persona.code === roleHighlight)
                            }
                            aiStatus={
                              aiAddedEntities?.has(task.display_id) ? 'added'
                              : aiModifiedEntities?.has(task.display_id) ? 'modified'
                              : undefined
                            }
                            onQuestionClick={onQuestionClick}
                            forceExpanded={expandAll ? true : undefined}
                            canEdit={canEdit}
                            onRenameTask={handleRenameTask}
                          />
                        </div>
                      ))
                    )}
                  </div>
                );
              });
            })}
          </div>
        )}
      </div>

      {/* Mini-Map */}
      <MiniMap
        activities={data.activities}
        personas={data.personas}
        containerRef={gridContainerRef}
        collapsed={miniMapCollapsed}
        onToggleCollapse={() => setMiniMapCollapsed(!miniMapCollapsed)}
        selectedActivities={selectedActivities}
        roleHighlight={roleHighlight}
        hideProposed={hideProposed}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// deduplicateTasks — merge multiple placements of the same task into one
// ---------------------------------------------------------------------------

function deduplicateTasks(tasks: Task[]): DeduplicatedTask[] {
  const map = new Map<string, DeduplicatedTask>();

  for (const task of tasks) {
    const existing = map.get(task.id);
    if (existing) {
      // Add this persona to the existing deduplicated task
      if (task.persona) {
        existing.personas.push({
          persona: task.persona,
          role: task.role,
          role_in_journey: task.role_in_journey,
          handoff_label: task.handoff_label,
        });
      }
    } else {
      // First occurrence — create deduplicated entry
      const { persona, role, role_in_journey, handoff_label, ...rest } = task;
      map.set(task.id, {
        ...rest,
        role_in_journey: role_in_journey ?? 'primary',
        handoff_label: null,
        personas: persona
          ? [{ persona, role, role_in_journey, handoff_label }]
          : [],
      });
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// ActivityHeader — dark header cell in row 1, spanning its steps' columns
// ---------------------------------------------------------------------------

function ActivityHeader({
  activity,
  gridColumn,
  dimmed,
  isLast,
  canEdit,
  onRename,
  isDropTarget,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  activity: Activity;
  gridColumn: string;
  dimmed: boolean;
  isLast: boolean;
  canEdit?: boolean;
  onRename?: (activityId: string, name: string) => Promise<void>;
  isDropTarget?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
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

  // Count questions in this activity
  const questionCount = activity.steps.reduce(
    (sum, s) => sum + s.tasks.reduce(
      (tSum, t) => tSum + t.questions.filter((q) => q.status !== 'resolved').length,
      0,
    ),
    0,
  );

  return (
    <div
      data-testid={`activity-${activity.display_id}`}
      data-display-id={activity.display_id}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        gridRow: 1,
        gridColumn,
        backgroundColor: '#1a1a2e',
        color: '#fff',
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '-0.2px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        borderRight: isLast ? 'none' : '2px solid rgba(255,255,255,0.1)',
        opacity: dimmed ? 0.1 : 1,
        pointerEvents: dimmed ? 'none' : undefined,
        outline: isDropTarget ? '2px dashed #3b82f6' : undefined,
        cursor: canEdit ? 'grab' : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '9px', fontWeight: 500, opacity: 0.4, marginRight: '6px' }}>
          {activity.display_id}
        </span>
        {onRename ? (
          <InlineEdit
            value={activity.name}
            onSave={(name) => onRename(activity.id, name)}
            disabled={!canEdit}
            darkBackground
            style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}
            inputClassName="text-white"
          />
        ) : (
          activity.name
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {/* Persona pills */}
        {personas.map((p) => (
          <span
            key={p.id}
            style={{
              fontSize: '8px',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: '10px',
              color: '#fff',
              letterSpacing: '0.3px',
              backgroundColor: p.color,
            }}
          >
            {p.code}
          </span>
        ))}

        {/* Question count badge */}
        {questionCount > 0 && (
          <span
            style={{
              background: '#f59e0b',
              color: '#1a1a2e',
              fontSize: '9px',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '10px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {questionCount} ?
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyMap — shown when there are no activities at all
// ---------------------------------------------------------------------------

function EmptyMap() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-eden-accent-light mb-4">
          <GridIcon className="w-8 h-8 text-eden-accent" />
        </div>
        <h3 className="text-lg font-semibold text-eden-text mb-1">
          No activities yet
        </h3>
        <p className="text-sm text-eden-text-2 max-w-sm">
          This story map is empty. Activities, steps, and tasks will appear
          here once they are created through the expert panel.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MapSkeleton — loading state for initial fetch
// ---------------------------------------------------------------------------

function MapSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Tab skeleton */}
      <div className="border-b border-eden-border px-4 py-2">
        <div className="flex gap-2">
          {[80, 64, 72, 56].map((w, i) => (
            <div
              key={i}
              className="h-8 rounded-lg bg-gray-200 animate-pulse"
              style={{ width: w }}
            />
          ))}
        </div>
      </div>

      {/* Grid skeleton — horizontal layout */}
      <div className="flex-1 p-6" style={{ backgroundColor: '#f0f2f5' }}>
        {/* Activity headers row */}
        <div className="flex gap-0 mb-0">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 flex-1 animate-pulse"
              style={{ backgroundColor: 'rgba(26,26,46,0.3)' }}
            />
          ))}
        </div>

        {/* Step headers row */}
        <div className="flex gap-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-10 flex-1 animate-pulse"
              style={{ backgroundColor: 'rgba(230,81,0,0.3)' }}
            />
          ))}
        </div>

        {/* Task cards area */}
        <div className="flex gap-0 mt-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-1 p-2 space-y-2" style={{ backgroundColor: '#f0f2f5' }}>
              <div className="h-20 bg-white/60 rounded-lg animate-pulse" />
              <div className="h-16 bg-white/40 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Legend skeleton */}
      <div className="border-t border-eden-border px-4 py-2.5">
        <div className="h-4 w-96 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon
// ---------------------------------------------------------------------------

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
