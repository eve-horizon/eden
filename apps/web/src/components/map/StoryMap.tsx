import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { MapResponse } from './types';
import { PersonaTabs } from './PersonaTabs';
import { RoleFilterPills } from './RoleFilterPills';
import { MapLegend } from './MapLegend';
import { ActivityRow } from './ActivityRow';
import { StepHeader } from './StepHeader';
import { TaskCard } from './TaskCard';

// ---------------------------------------------------------------------------
// StoryMap — main component
//
// Fetches the map API, manages persona tab (server-side) and role highlight
// (client-side) filters, then renders the CSS Grid.
//
// Grid layout:
//   - Columns = all steps across all activities, each 320px wide
//   - Activities are row groups that span all columns (via ActivityRow)
//   - Under each activity: one row of StepHeaders + one row of task columns
// ---------------------------------------------------------------------------

export function StoryMap() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Server-side persona filter (re-fetches API)
  const personaTab = searchParams.get('persona');
  const releaseFilter = searchParams.get('release');

  // Client-side role highlight (dims non-matching cards)
  const [roleHighlight, setRoleHighlight] = useState<string | null>(null);

  // Data state
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map');
    } finally {
      setLoading(false);
    }
  }, [projectId, personaTab, releaseFilter]);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  // Persona tab selection — updates the URL search param which triggers
  // a re-fetch via the effect above.
  const handlePersonaTabSelect = useCallback(
    (code: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (code) {
          next.set('persona', code);
        } else {
          next.delete('persona');
        }
        return next;
      });
    },
    [setSearchParams],
  );

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

  // Collect the maximum step count across all activities (for column sizing)
  const maxStepsInActivity = Math.max(
    ...data.activities.map((a) => a.steps.length),
    1, // Guard against empty
  );

  return (
    <div className="flex flex-col h-full">
      {/* Persona tabs (server-side filter) */}
      <PersonaTabs
        personas={data.personas}
        active={personaTab}
        onSelect={handlePersonaTabSelect}
      />

      {/* Role filter pills (client-side highlight) */}
      <RoleFilterPills
        personas={data.personas}
        active={roleHighlight}
        onToggle={setRoleHighlight}
      />

      {/* Loading overlay for re-fetches */}
      {loading && (
        <div className="px-4 py-1">
          <div className="h-0.5 bg-eden-accent/20 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-eden-accent rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* Scrollable grid area */}
      <div className="flex-1 overflow-auto eden-scroll p-4">
        {data.activities.length === 0 ? (
          <EmptyMap />
        ) : (
          <div
            className="grid gap-3 min-w-max"
            style={{
              gridTemplateColumns: `repeat(${maxStepsInActivity}, minmax(320px, 320px))`,
            }}
          >
            {data.activities.map((activity) => (
              <ActivitySection
                key={activity.id}
                activity={activity}
                stepCount={maxStepsInActivity}
                roleHighlight={roleHighlight}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legend bar */}
      <MapLegend stats={data.stats} personas={data.personas} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivitySection — renders one activity's header + step columns + tasks
// ---------------------------------------------------------------------------

interface ActivitySectionProps {
  activity: MapResponse['activities'][number];
  stepCount: number;
  roleHighlight: string | null;
}

function ActivitySection({
  activity,
  stepCount,
  roleHighlight,
}: ActivitySectionProps) {
  return (
    <>
      {/* Activity header band — spans all columns */}
      <ActivityRow activity={activity} stepCount={stepCount} />

      {/* Step headers */}
      {activity.steps.map((step) => (
        <StepHeader key={step.id} step={step} />
      ))}
      {/* Fill remaining columns if this activity has fewer steps */}
      {Array.from({ length: stepCount - activity.steps.length }).map(
        (_, i) => (
          <div key={`fill-header-${i}`} />
        ),
      )}

      {/* Task cards — one column per step */}
      {activity.steps.map((step) => (
        <div key={`tasks-${step.id}`} className="space-y-2 pb-2">
          {step.tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
              <p className="text-xs text-eden-text-2 italic">No tasks</p>
            </div>
          ) : (
            step.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                dimmed={
                  roleHighlight !== null &&
                  task.persona?.code !== roleHighlight
                }
              />
            ))
          )}
        </div>
      ))}
      {/* Fill remaining columns for tasks too */}
      {Array.from({ length: stepCount - activity.steps.length }).map(
        (_, i) => (
          <div key={`fill-tasks-${i}`} />
        ),
      )}
    </>
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
    <div className="flex flex-col h-full">
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

      {/* Grid skeleton */}
      <div className="flex-1 p-4 space-y-3">
        {/* Activity header skeleton */}
        <div className="h-10 bg-gray-800/10 rounded-lg animate-pulse" />

        {/* Step headers */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>

        {/* Task cards */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>

        {/* Second activity skeleton */}
        <div className="h-10 bg-gray-800/10 rounded-lg animate-pulse mt-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 bg-gray-200 rounded-lg animate-pulse"
            />
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
