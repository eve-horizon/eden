import { useCallback, useEffect, useRef } from 'react';
import type { Activity, Persona } from './types';

// ---------------------------------------------------------------------------
// MiniMap — bird's-eye navigation overlay for the story map grid
//
// Fixed bottom-right panel showing a miniature representation of the entire
// grid. Click or drag to scroll the main container. Viewport indicator tracks
// the current scroll position via direct DOM mutation (no React re-renders)
// for smooth drag performance matching the prototype.
// ---------------------------------------------------------------------------

interface MiniMapProps {
  activities: Activity[];
  personas?: Persona[];
  containerRef: React.RefObject<HTMLDivElement>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  selectedActivities?: Set<string>;
  roleHighlight?: string | null;
  hideProposed?: boolean;
}

const MINIMAP_WIDTH = 300;
const HEADER_HEIGHT = 32;

export function MiniMap({
  activities,
  containerRef,
  collapsed = false,
  onToggleCollapse,
  selectedActivities,
  roleHighlight,
  hideProposed = false,
}: MiniMapProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Total columns = sum of all steps
  const totalCols = activities.reduce((sum, a) => sum + Math.max(a.steps.length, 1), 0);

  // -----------------------------------------------------------------------
  // Viewport indicator — direct DOM mutation, no setState, no re-renders.
  // Matches the prototype's updateMinimapViewport() approach.
  // -----------------------------------------------------------------------
  const updateViewport = useCallback(() => {
    const el = containerRef.current;
    const body = bodyRef.current;
    const vp = vpRef.current;
    if (!el || !body || !vp) return;

    const bw = body.offsetWidth;
    const bh = body.offsetHeight;
    const sw = el.scrollWidth;
    const sh = el.scrollHeight;

    vp.style.left = (el.scrollLeft / sw * bw) + 'px';
    vp.style.top = (el.scrollTop / sh * bh) + 'px';
    vp.style.width = Math.min(el.clientWidth / sw * bw, bw) + 'px';
    vp.style.height = Math.min(el.clientHeight / sh * bh, bh) + 'px';
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateViewport();
    el.addEventListener('scroll', updateViewport, { passive: true });
    window.addEventListener('resize', updateViewport);

    return () => {
      el.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [containerRef, updateViewport]);

  // -----------------------------------------------------------------------
  // Click/drag navigation — mousedown starts, mousemove continues, mouseup
  // stops. Immediate scroll assignment (no smooth), matching the prototype.
  // -----------------------------------------------------------------------
  const navTo = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      const body = bodyRef.current;
      if (!el || !body) return;

      const rect = body.getBoundingClientRect();
      const fracX = (clientX - rect.left) / rect.width;
      const fracY = (clientY - rect.top) / rect.height;

      el.scrollLeft = fracX * el.scrollWidth - el.clientWidth / 2;
      el.scrollTop = fracY * el.scrollHeight - el.clientHeight / 2;
    },
    [containerRef],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      navTo(e.clientX, e.clientY);
      e.preventDefault();
    },
    [navTo],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) navTo(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      draggingRef.current = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [navTo]);

  return (
    <div
      data-testid="minimap"
      className="minimap fixed bottom-14 right-4 z-50 rounded-lg shadow-lg overflow-hidden select-none print:hidden"
      style={{ width: MINIMAP_WIDTH }}
    >
      {/* Header */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-between w-full px-3 text-[11px] font-semibold text-white/90 cursor-pointer select-none"
        style={{ backgroundColor: '#1a1a2e', height: HEADER_HEIGHT }}
      >
        <span>Mini-Map</span>
        <ChevronMiniIcon
          className={`w-3.5 h-3.5 transition-transform duration-150 ${
            collapsed ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Body — horizontal grid matching main layout */}
      {!collapsed && (
        <div
          ref={bodyRef}
          className="relative cursor-crosshair"
          style={{
            backgroundColor: '#f0f2f5',
            padding: '8px',
            minHeight: 60,
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Viewport indicator — positioned via direct DOM mutation */}
          <div
            ref={vpRef}
            className="absolute pointer-events-none"
            style={{
              border: '2px solid #e65100',
              background: 'rgba(230, 81, 0, .08)',
              borderRadius: '2px',
              boxShadow: '0 0 8px rgba(230, 81, 0, .2)',
            }}
          />

          {/* Grid: horizontal layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
              gap: '2px',
              width: '100%',
            }}
          >
            {/* Activity labels (row 1) */}
            {activities.map((activity) => {
              const span = Math.max(activity.steps.length, 1);
              const isDimmed =
                selectedActivities != null &&
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return (
                <div
                  key={`mm-act-${activity.id}`}
                  style={{
                    gridColumn: `span ${span}`,
                    backgroundColor: '#1e293b',
                    color: '#fff',
                    fontSize: '7px',
                    fontWeight: 700,
                    padding: '3px 4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    borderRadius: '2px',
                    lineHeight: 1.3,
                    opacity: isDimmed ? 0.15 : 1,
                  }}
                >
                  {activity.display_id.replace('ACT-', '')}. {activity.name}
                </div>
              );
            })}

            {/* Step bars (row 2) */}
            {activities.map((activity) => {
              const isDimmed =
                selectedActivities != null &&
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return activity.steps.map((step) => (
                <div
                  key={`mm-stp-${step.id}`}
                  style={{
                    height: '4px',
                    backgroundColor: '#e65100',
                    borderRadius: '1px',
                    opacity: isDimmed ? 0.15 : 0.6,
                  }}
                />
              ));
            })}

            {/* Task bars (row 3) */}
            {activities.map((activity) => {
              const isDimmed =
                selectedActivities != null &&
                selectedActivities.size > 0 &&
                !selectedActivities.has(activity.id);

              return activity.steps.map((step) => {
                const tasks = hideProposed
                  ? step.tasks.filter((t) => (t.lifecycle ?? 'current') !== 'proposed')
                  : step.tasks;

                return (
                  <div
                    key={`mm-tasks-${step.id}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1px',
                      padding: '2px 1px',
                      minHeight: '12px',
                      opacity: isDimmed ? 0.15 : 1,
                    }}
                  >
                    {tasks.map((task) => {
                      const lifecycle = task.lifecycle ?? 'current';
                      const isDiscontinued = lifecycle === 'discontinued';
                      const isProposed = lifecycle === 'proposed';
                      const dimmedByRole =
                        roleHighlight != null &&
                        task.persona?.code !== roleHighlight;

                      let barColor = task.persona?.color ?? '#9ca3af';
                      if (isProposed) barColor = '#10b981';
                      if (isDiscontinued) barColor = '#9ca3af';

                      return (
                        <div
                          key={`mm-t-${task.id}`}
                          style={{
                            height: '3px',
                            borderRadius: '1px',
                            backgroundColor: barColor,
                            borderLeft: `2px solid ${barColor}`,
                            opacity: isDiscontinued
                              ? 0.3
                              : dimmedByRole
                                ? 0.2
                                : 0.8,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              });
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon
// ---------------------------------------------------------------------------

function ChevronMiniIcon({ className }: { className?: string }) {
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
