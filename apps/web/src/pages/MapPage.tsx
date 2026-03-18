import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { StoryMap } from '../components/map/StoryMap';
import { ReleaseSlices } from '../components/map/ReleaseSlices';
import { ChatPanel } from '../components/chat/ChatPanel';
import { CrossCuttingPanel } from '../components/questions/CrossCuttingPanel';
import { QuestionModal } from '../components/questions/QuestionModal';
import { ChangesetReviewModal } from '../components/changesets/ChangesetReviewModal';
import { EvolvedBadge } from '../components/map/EvolvedBadge';
import { useProjectRole } from '../hooks/useProjectRole';
import { usePendingApprovals } from '../hooks/usePendingApprovals';

// ---------------------------------------------------------------------------
// MapPage — renders the full story map grid with Phase 3 intelligence panels
// and Phase 4 toolbar controls (lifecycle toggle, export, print).
// ---------------------------------------------------------------------------

interface ChangesetDetail {
  id: string;
  title: string;
  reasoning: string | null;
  source: string | null;
  status: string;
  created_at: string;
  items: any[];
}

export function MapPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // Role-based access — canEdit will gate future inline editing controls
  const projectRole = useProjectRole(projectId);
  const { isOwner, canEdit } = projectRole;
  const pendingApprovals = usePendingApprovals(projectId);
  const { items: pendingItems } = pendingApprovals;

  // Pending approvals panel
  const [pendingOpen, setPendingOpen] = useState(false);

  // Panel state
  const [chatOpen, setChatOpen] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [questionModalId, setQuestionModalId] = useState<string | null>(null);

  // Changeset review modal state
  const [reviewingChangeset, setReviewingChangeset] = useState<string | null>(null);
  const [changesetDetail, setChangesetDetail] = useState<ChangesetDetail | null>(null);
  const [changesetLoading, setChangesetLoading] = useState(false);

  // AI modification tracking
  const [aiModifiedEntities, setAiModifiedEntities] = useState<Set<string>>(new Set());
  const [aiAddedEntities, setAiAddedEntities] = useState<Set<string>>(new Set());
  const [evolvedCount, setEvolvedCount] = useState(0);

  // Map refresh trigger
  const [mapRefreshKey, setMapRefreshKey] = useState(0);

  // Phase 4: lifecycle toggle (lifted to page level)
  const [hideProposed, setHideProposed] = useState(false);

  // Expand all / questions only
  const [expandAll, setExpandAll] = useState(false);
  const [questionsOnly, setQuestionsOnly] = useState(false);

  // Data from StoryMap
  const [mapStats, setMapStats] = useState<{
    activity_count: number; step_count: number; task_count: number;
    acceptance_criteria_count: number; question_count: number;
    answered_question_count: number; persona_counts: Record<string, number>;
  } | null>(null);
  const [mapActivities, setMapActivities] = useState<{ id: string; display_id: string; name: string }[]>([]);
  const [mapPersonas, setMapPersonas] = useState<{ id: string; code: string; name: string; color: string }[]>([]);

  // Filter state for activity and role (managed here, applied via URL params)
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set());
  const [roleHighlight, setRoleHighlight] = useState<string | null>(null);

  const handleDataReady = useCallback((data: {
    stats: typeof mapStats extends infer T ? NonNullable<T> : never;
    activities: typeof mapActivities;
    personas: typeof mapPersonas;
  }) => {
    setMapStats(data.stats);
    setMapActivities(data.activities);
    setMapPersonas(data.personas);
    // Initialize all activities selected on first load
    setSelectedActivities(prev => prev.size === 0 ? new Set(data.activities.map(a => a.id)) : prev);
  }, []);

  // Dropdown menus
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Open changeset review modal
  const handleReviewChangeset = useCallback(async (changesetId: string) => {
    setReviewingChangeset(changesetId);
    setChangesetLoading(true);
    try {
      const detail = await api.get<ChangesetDetail>(`/changesets/${changesetId}`);
      setChangesetDetail(detail);
    } catch {
      setChangesetDetail(null);
    } finally {
      setChangesetLoading(false);
    }
  }, []);

  // After changeset accept/reject, refresh map and track AI modifications
  const handleChangesetRefresh = useCallback(async () => {
    if (!reviewingChangeset) return;
    try {
      const detail = await api.get<ChangesetDetail>(`/changesets/${reviewingChangeset}`);
      setChangesetDetail(detail);

      // Track AI modifications
      const aiSources = ['map-chat', 'question-evolution', 'expert-panel'];
      if (detail.status === 'accepted' && detail.source && aiSources.includes(detail.source)) {
        setEvolvedCount(prev => prev + 1);
        const newModified = new Set(aiModifiedEntities);
        const newAdded = new Set(aiAddedEntities);
        for (const item of detail.items) {
          if (item.status === 'accepted' && item.display_reference) {
            if (item.operation === 'create') {
              newAdded.add(item.display_reference);
            } else {
              newModified.add(item.display_reference);
            }
          }
        }
        setAiModifiedEntities(newModified);
        setAiAddedEntities(newAdded);
      }

      // Refresh map
      setMapRefreshKey(prev => prev + 1);
    } catch {
      // Keep current state
    }
  }, [reviewingChangeset, aiModifiedEntities, aiAddedEntities]);

  // Flash navigation — scroll to entity and highlight
  const handleReferenceClick = useCallback((displayId: string) => {
    const el = document.querySelector(`[data-display-id="${displayId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 2000);
    }
  }, []);

  // Export JSON — fetches map data and downloads as .json
  const handleExportJson = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get(`/projects/${projectId}/map`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `story-map-${projectId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — could add toast notification later
    }
  }, [projectId]);

  // Export Markdown — fetches map data and converts to markdown
  const handleExportMarkdown = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.get<{
        project: { name: string };
        activities: Array<{
          display_id: string;
          name: string;
          steps: Array<{
            display_id: string;
            name: string;
            tasks: Array<{
              display_id: string;
              title: string;
              priority: string;
              status: string;
              persona: { name: string } | null;
              user_story: string | null;
            }>;
          }>;
        }>;
      }>(`/projects/${projectId}/map`);

      let md = `# ${data.project.name} — Story Map\n\n`;

      for (const activity of data.activities) {
        md += `## ${activity.display_id} ${activity.name}\n\n`;
        for (const step of activity.steps) {
          md += `### ${step.display_id} ${step.name}\n\n`;
          for (const task of step.tasks) {
            md += `- **${task.display_id}** ${task.title}`;
            if (task.persona) md += ` _(${task.persona.name})_`;
            md += ` — ${task.priority} / ${task.status}`;
            md += '\n';
            if (task.user_story) {
              md += `  > ${task.user_story}\n`;
            }
          }
          md += '\n';
        }
      }

      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `story-map-${projectId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    }
  }, [projectId]);

  if (!projectId) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Toolbar — matching live prototype: Questions + Filter + ... + stats RHS */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
          padding: '8px 24px',
          boxShadow: '0 4px 20px rgba(0,0,0,.25)',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* Left: main action buttons */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <EvolvedBadge visible={evolvedCount > 0} count={evolvedCount} />

          {/* Questions button — opens cross-cutting panel */}
          <ToolbarButton
            active={questionsOpen}
            onClick={() => { setQuestionsOpen(!questionsOpen); setChatOpen(false); }}
            data-testid="cross-cutting-qs-btn"
          >
            Questions
          </ToolbarButton>

          {/* Filter dropdown — contains Expand, Questions Only, Legend, Activity filter, Role filter */}
          <div ref={filterRef} style={{ position: 'relative' }}>
            <ToolbarButton
              active={filterOpen || expandAll || questionsOnly}
              accent={expandAll || questionsOnly}
              onClick={() => { setFilterOpen(!filterOpen); setMoreOpen(false); }}
            >
              Filter ▾
            </ToolbarButton>
            {filterOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                minWidth: '220px', maxHeight: '70vh', overflowY: 'auto',
                background: '#fff', border: '1px solid #e2e5e9',
                borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                zIndex: 200, padding: '4px 0', color: '#1a1a2e',
              }}>
                <DropdownItem
                  label={expandAll ? 'Collapse All' : 'Expand All'}
                  active={expandAll}
                  onClick={() => setExpandAll(!expandAll)}
                  data-testid="expand-all-btn"
                />
                <DropdownItem
                  label="Questions Only"
                  active={questionsOnly}
                  onClick={() => setQuestionsOnly(!questionsOnly)}
                  data-testid="questions-only-btn"
                />
                <DropdownItem
                  label={hideProposed ? 'Show 2.0' : 'Hide 2.0'}
                  active={!hideProposed}
                  onClick={() => setHideProposed(!hideProposed)}
                  data-testid="hide-proposed-btn"
                />

                {/* Filter by Activity */}
                {mapActivities.length > 0 && (
                  <>
                    <DropdownLabel>Filter by Activity</DropdownLabel>
                    <DropdownItem
                      label="All Activities"
                      active={selectedActivities.size === mapActivities.length}
                      onClick={() => setSelectedActivities(new Set(mapActivities.map(a => a.id)))}
                    />
                    {mapActivities.map((a, i) => (
                      <DropdownItem
                        key={a.id}
                        label={`${i + 1}. ${a.name}`}
                        active={selectedActivities.has(a.id)}
                        onClick={() => {
                          const next = new Set(selectedActivities);
                          if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                          setSelectedActivities(next);
                        }}
                      />
                    ))}
                  </>
                )}

                {/* Filter by Role */}
                {mapPersonas.length > 0 && (
                  <>
                    <DropdownLabel>Filter by Role</DropdownLabel>
                    <div style={{ display: 'flex', gap: '6px', padding: '6px 14px', flexWrap: 'wrap' }}>
                      {mapPersonas.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setRoleHighlight(roleHighlight === p.code ? null : p.code)}
                          style={{
                            padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.15s', border: `2px solid ${p.color}`,
                            background: roleHighlight === p.code ? p.color : 'transparent',
                            color: roleHighlight === p.code ? '#fff' : p.color,
                          }}
                        >
                          {p.code}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* More menu — Print, Export, Settings */}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <ToolbarButton
              active={moreOpen}
              onClick={() => { setMoreOpen(!moreOpen); setFilterOpen(false); }}
            >
              &#x22EF;
            </ToolbarButton>
            {moreOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                minWidth: '180px', background: '#fff', border: '1px solid #e2e5e9',
                borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                zIndex: 200, padding: '4px 0', color: '#1a1a2e',
              }}>
                <DropdownItem label="Print" onClick={() => { window.print(); setMoreOpen(false); }} data-testid="print-btn" />
                <DropdownItem label="Export JSON" onClick={() => { handleExportJson(); setMoreOpen(false); }} data-testid="export-json-btn" />
                <DropdownItem label="Export Markdown" onClick={() => { handleExportMarkdown(); setMoreOpen(false); }} data-testid="export-md-btn" />
              </div>
            )}
          </div>

          {/* Pending Approvals badge — owner-only */}
          {pendingItems.length > 0 && isOwner && (
            <button
              onClick={() => setPendingOpen(!pendingOpen)}
              style={{
                padding: '4px 12px', background: 'rgba(245,158,11,.2)',
                color: '#fbbf24', border: '1px solid rgba(245,158,11,.3)',
                borderRadius: '20px', fontSize: '10px', fontWeight: 800,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
              }}
              data-testid="pending-approvals-btn"
            >
              {pendingItems.length} Pending
            </button>
          )}
        </div>

        {/* Right: compact inline stats matching prototype header */}
        {mapStats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <InlineStat n={mapStats.activity_count} label="A" />
            <StatDot />
            <InlineStat n={mapStats.step_count} label="S" />
            <StatDot />
            <InlineStat n={mapStats.task_count} label="T" />
            <StatDot />
            <InlineStat n={mapStats.acceptance_criteria_count} label="AC" />
            <StatDot />
            <InlineStat n={mapStats.question_count} label="Q" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                {mapStats.answered_question_count}/{mapStats.question_count}
              </span>
              <div style={{ width: '50px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: mapStats.question_count > 0
                    ? `${(mapStats.answered_question_count / mapStats.question_count) * 100}%`
                    : '0%',
                  height: '100%', background: '#10b981', borderRadius: '2px',
                }} />
              </div>
              <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                Answered
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Story Map */}
      <StoryMap
        key={mapRefreshKey}
        aiModifiedEntities={aiModifiedEntities}
        aiAddedEntities={aiAddedEntities}
        onQuestionClick={setQuestionModalId}
        hideProposed={hideProposed}
        expandAll={expandAll}
        questionsOnly={questionsOnly}
        onDataReady={handleDataReady}
      />

      {/* Release Slices — below the map grid */}
      <ReleaseSlices projectId={projectId} canEdit={canEdit} />

      {/* Chat Panel */}
      <ChatPanel
        projectId={projectId}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onReviewChangeset={handleReviewChangeset}
      />

      {/* Cross-Cutting Questions Panel */}
      <CrossCuttingPanel
        projectId={projectId}
        open={questionsOpen}
        onClose={() => setQuestionsOpen(false)}
        onQuestionClick={setQuestionModalId}
        onReferenceClick={handleReferenceClick}
      />

      {/* Question Modal */}
      <QuestionModal
        questionId={questionModalId}
        onClose={() => setQuestionModalId(null)}
        onReferenceClick={handleReferenceClick}
      />

      {/* Changeset Review Modal */}
      {reviewingChangeset && (
        <ChangesetReviewModal
          detail={changesetDetail}
          loading={changesetLoading}
          onClose={() => {
            setReviewingChangeset(null);
            setChangesetDetail(null);
          }}
          onRefresh={handleChangesetRefresh}
        />
      )}

      {/* Chat FAB — matching prototype's bottom-right floating button */}
      {!chatOpen && (
        <button
          onClick={() => { setChatOpen(true); setQuestionsOpen(false); }}
          style={{
            position: 'fixed', bottom: '24px', right: '24px', zIndex: 100,
            width: '56px', height: '56px', borderRadius: '50%',
            background: '#e65100', color: '#fff', border: 'none',
            boxShadow: '0 4px 16px rgba(230,81,0,0.35)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(230,81,0,0.45)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(230,81,0,0.35)'; }}
          data-testid="chat-fab"
          title="Open chat"
        >
          <ChatIcon className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolbarButton — dark-header button matching prototype's hdr-actions style
// ---------------------------------------------------------------------------

function ToolbarButton({
  children,
  active,
  accent,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
  [key: string]: any;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: active
          ? (accent ? '1px solid #e65100' : '1px solid rgba(255,255,255,0.5)')
          : '1px solid rgba(255,255,255,0.2)',
        background: active
          ? (accent ? '#e65100' : 'rgba(255,255,255,0.15)')
          : 'rgba(255,255,255,0.07)',
        color: '#fff',
        borderRadius: '7px',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// InlineStat + StatDot — compact header stats matching prototype's stats-inline
// ---------------------------------------------------------------------------

function InlineStat({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: '2px', fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
      {n}
      <small style={{ fontSize: '9px', fontWeight: 600, opacity: 0.5, textTransform: 'uppercase' as const }}>{label}</small>
    </span>
  );
}

function StatDot() {
  return <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>&middot;</span>;
}

// ---------------------------------------------------------------------------
// DropdownLabel — section header in dropdown matching prototype's hdr-dropdown-label
// ---------------------------------------------------------------------------

function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 14px 4px', fontSize: '9px', fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6b7280',
      borderTop: '1px solid #e2e5e9', marginTop: '4px',
    }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropdownItem — white dropdown menu item matching prototype's hdr-dropdown-item
// ---------------------------------------------------------------------------

function DropdownItem({
  label,
  active,
  onClick,
  ...rest
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  [key: string]: any;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
        padding: '8px 14px', border: 'none', background: 'transparent',
        color: '#1a1a2e', fontSize: '12px', fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      {...rest}
    >
      {active !== undefined && (
        <span style={{ width: '16px', fontSize: '12px', fontWeight: 700, color: '#e65100', textAlign: 'center', flexShrink: 0 }}>
          {active ? '✓' : ''}
        </span>
      )}
      {label}
    </button>
  );
}
