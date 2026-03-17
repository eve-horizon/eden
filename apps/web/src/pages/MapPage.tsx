import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { StoryMap } from '../components/map/StoryMap';
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
  const { isOwner } = projectRole;
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
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-eden-border bg-eden-surface">
        <div className="flex items-center gap-3">
          <EvolvedBadge
            visible={evolvedCount > 0}
            count={evolvedCount}
          />

          {/* Expand All toggle */}
          <button
            onClick={() => setExpandAll(!expandAll)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border transition-colors
              ${expandAll
                ? 'bg-eden-accent text-white border-eden-accent'
                : 'bg-eden-bg text-eden-text-2 border-eden-border hover:text-eden-text'
              }`}
            data-testid="expand-all-btn"
          >
            <ExpandIcon className="w-3.5 h-3.5" />
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>

          {/* Questions Only toggle */}
          <button
            onClick={() => setQuestionsOnly(!questionsOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border transition-colors
              ${questionsOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-eden-bg text-eden-text-2 border-eden-border hover:text-eden-text'
              }`}
            data-testid="questions-only-btn"
          >
            <QuestionFilterIcon className="w-3.5 h-3.5" />
            Questions Only
          </button>

          {/* Hide/Show 2.0 toggle */}
          <button
            onClick={() => setHideProposed(!hideProposed)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              border transition-colors
              ${hideProposed
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-white text-emerald-600 border-emerald-300 hover:bg-emerald-50'
              }`}
            data-testid="hide-proposed-btn"
          >
            <EyeIcon className="w-3.5 h-3.5" slash={hideProposed} />
            {hideProposed ? 'Show 2.0' : 'Hide 2.0'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-eden-bg text-eden-text-2 hover:text-eden-text transition-colors"
            title="Export as JSON"
            data-testid="export-json-btn"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            JSON
          </button>

          {/* Export Markdown */}
          <button
            onClick={handleExportMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-eden-bg text-eden-text-2 hover:text-eden-text transition-colors"
            title="Export as Markdown"
            data-testid="export-md-btn"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            MD
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-eden-bg text-eden-text-2 hover:text-eden-text transition-colors"
            title="Print story map"
            data-testid="print-btn"
          >
            <PrintIcon className="w-3.5 h-3.5" />
            Print
          </button>

          <div className="w-px h-5 bg-eden-border" />

          {/* Pending Approvals badge — owner-only */}
          {pendingItems.length > 0 && isOwner && (
            <button
              onClick={() => setPendingOpen(!pendingOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors"
              data-testid="pending-approvals-btn"
            >
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingItems.length}
              </span>
              Pending Review
            </button>
          )}

          {/* Cross-Cutting Qs */}
          <button
            onClick={() => { setQuestionsOpen(!questionsOpen); setChatOpen(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${questionsOpen ? 'bg-red-100 text-red-700' : 'bg-eden-bg text-eden-text-2 hover:text-eden-text'}`}
            data-testid="cross-cutting-qs-btn"
          >
            <AlertTriangleIcon className="w-3.5 h-3.5" />
            Cross-Cutting Qs
          </button>

          {/* Chat */}
          <button
            onClick={() => { setChatOpen(!chatOpen); setQuestionsOpen(false); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${chatOpen ? 'bg-eden-accent/10 text-eden-accent' : 'bg-eden-bg text-eden-text-2 hover:text-eden-text'}`}
            data-testid="chat-toggle-btn"
          >
            <ChatIcon className="w-3.5 h-3.5" />
            Chat
          </button>
        </div>
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
      />

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
    </div>
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

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function EyeIcon({ className, slash }: { className?: string; slash?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {slash && <line x1="1" y1="1" x2="23" y2="23" />}
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function PrintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function QuestionFilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
