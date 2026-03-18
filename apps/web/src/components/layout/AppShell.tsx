import { useCallback, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEveAuth } from '@eve-horizon/auth-react';
import { NotificationBell } from './NotificationBell';
import { Walkthrough, isWalkthroughComplete, resetWalkthrough } from '../onboarding/Walkthrough';
import type { WalkthroughRole } from '../onboarding/Walkthrough';
import { WalkthroughTrigger } from '../onboarding/WalkthroughTrigger';

interface EveUser {
  id: string;
  email: string;
  orgId: string;
  role: 'owner' | 'admin' | 'member';
  organizations?: Array<{ id: string; role: string }>;
}

interface AppShellProps {
  user: EveUser;
  onLogout: () => void;
  projectId?: string;
  projectName?: string;
  children: React.ReactNode;
}

export function AppShell({
  user,
  onLogout,
  projectId,
  projectName,
  children,
}: AppShellProps) {
  const [orgOpen, setOrgOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const { orgs, activeOrg, switchOrg } = useEveAuth();
  const currentOrgId = activeOrg?.id ?? user.orgId;

  // Walkthrough state — derive role from user's org role
  const walkthroughRole: WalkthroughRole = user.role === 'owner' || user.role === 'admin' ? 'owner' : 'viewer';
  const [walkthroughActive, setWalkthroughActive] = useState(
    () => projectId != null && !isWalkthroughComplete(walkthroughRole),
  );

  const handleReplayWalkthrough = useCallback(() => {
    resetWalkthrough(walkthroughRole);
    setWalkthroughActive(true);
  }, [walkthroughRole]);

  // Build nav items based on whether we have a project context
  const navItems = projectId
    ? [
        {
          to: `/projects/${projectId}/map`,
          label: 'Map',
          icon: MapIcon,
          match: '/map',
        },
        {
          to: `/projects/${projectId}/qa`,
          label: 'Q&A',
          icon: QuestionIcon,
          match: '/qa',
        },
        {
          to: `/projects/${projectId}/releases`,
          label: 'Releases',
          icon: ReleaseIcon,
          match: '/releases',
        },
        {
          to: `/projects/${projectId}/changes`,
          label: 'Changes',
          icon: ChangesIcon,
          match: '/changes',
        },
        {
          to: `/projects/${projectId}/reviews`,
          label: 'Reviews',
          icon: ReviewsNavIcon,
          match: '/reviews',
        },
        {
          to: `/projects/${projectId}/sources`,
          label: 'Sources',
          icon: SourcesIcon,
          match: '/sources',
        },
        {
          to: `/projects/${projectId}/audit`,
          label: 'Audit',
          icon: AuditNavIcon,
          match: '/audit',
        },
        {
          to: `/projects/${projectId}/members`,
          label: 'Members',
          icon: MembersNavIcon,
          match: '/members',
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-eden-bg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-[100] bg-eden-header px-6 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Brand */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <span className="text-white font-extrabold text-base">E</span>
              </div>
              <h1 className="text-white text-xl font-extrabold tracking-[-0.5px]">
                Eden
              </h1>
            </button>

            {/* Project breadcrumb */}
            {projectName && (
              <div className="flex items-center gap-2 text-white/60">
                <ChevronRight className="w-4 h-4" />
                <span className="text-sm font-medium text-white/90">
                  {projectName}
                </span>
              </div>
            )}

            {/* Org Switcher — only on projects page, only with multiple orgs */}
            {!projectId && orgs.length > 1 && (
              <div className="relative ml-2">
                <button
                  onClick={() => {
                    setOrgOpen(!orgOpen);
                    setUserMenuOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5
                             text-sm text-white/90 hover:bg-white/15 transition-colors"
                >
                  <span className="font-medium">
                    {formatOrgName(currentOrgId)}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-white/60" />
                </button>

                {orgOpen && (
                  <div className="absolute left-0 top-full mt-1 w-56 rounded-eden bg-eden-surface shadow-modal border border-eden-border py-1 z-50">
                    {orgs.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          switchOrg(org.id);
                          setOrgOpen(false);
                          navigate('/');
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-eden-bg transition-colors
                          ${org.id === currentOrgId ? 'text-eden-accent font-semibold' : 'text-eden-text'}`}
                      >
                        {formatOrgName(org.id)}
                        {org.id === currentOrgId && (
                          <span className="float-right text-eden-accent">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notification bell + User menu */}
          <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="relative">
            <button
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setOrgOpen(false);
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5
                         text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-eden-accent flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {user.email.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <span className="font-medium hidden sm:inline">{user.email}</span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-eden bg-eden-surface shadow-modal border border-eden-border py-1 z-50">
                <div className="px-3 py-2 border-b border-eden-border">
                  <p className="text-sm font-medium text-eden-text truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-eden-text-2 truncate">
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 flex-shrink-0 bg-eden-surface border-r border-eden-border flex flex-col">
          <div className="flex-1 py-4 px-3 space-y-1">
            {/* Projects link — always visible */}
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                ${
                  isActive && !projectId
                    ? 'bg-eden-accent-light text-eden-accent'
                    : 'text-eden-text-2 hover:bg-eden-bg hover:text-eden-text'
                }`
              }
            >
              <ProjectsIcon
                className={`w-5 h-5 ${
                  location.pathname === '/' && !projectId
                    ? 'text-eden-accent'
                    : 'text-eden-text-2'
                }`}
              />
              Projects
            </NavLink>

            {/* Separator when project context is active */}
            {projectId && (
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-eden-text-2">
                  {projectName ?? 'Project'}
                </p>
              </div>
            )}

            {/* Project-scoped nav items */}
            {navItems.map(({ to, label, icon: Icon, match }) => {
              const isActive = location.pathname.includes(match);

              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                    ${
                      isActive
                        ? 'bg-eden-accent-light text-eden-accent'
                        : 'text-eden-text-2 hover:bg-eden-bg hover:text-eden-text'
                    }`}
                >
                  <Icon
                    className={`w-5 h-5 ${isActive ? 'text-eden-accent' : 'text-eden-text-2'}`}
                  />
                  {label}
                </NavLink>
              );
            })}
          </div>

          <div className="px-3 py-4 border-t border-eden-border flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-wider text-eden-text-2">
              Phase 6c
            </p>
            {projectId && (
              <WalkthroughTrigger onClick={handleReplayWalkthrough} />
            )}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex flex-1 min-h-0 flex-col overflow-hidden">{children}</main>
      </div>

      {/* Walkthrough overlay */}
      {projectId && (
        <Walkthrough
          role={walkthroughRole}
          active={walkthroughActive}
          onDismiss={() => setWalkthroughActive(false)}
        />
      )}
    </div>
  );
}

/* ---------- Helpers ---------- */

/** Strip `org_` prefix and humanize: "org_Incept5" → "Incept5" */
function formatOrgName(orgId: string | undefined): string {
  if (!orgId) return 'Select org';
  return orgId.replace(/^org_/i, '');
}

/* ---------- Inline SVG icons ---------- */

function ChevronDown({ className }: { className?: string }) {
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

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.22 5.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ProjectsIcon({ className }: { className?: string }) {
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
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
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

function QuestionIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ReleaseIcon({ className }: { className?: string }) {
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
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function ChangesIcon({ className }: { className?: string }) {
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
      <path d="M12 3v18" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 11h16" />
      <path d="M4 15h16" />
      <path d="M4 19h16" />
    </svg>
  );
}

function SourcesIcon({ className }: { className?: string }) {
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
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ReviewsNavIcon({ className }: { className?: string }) {
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
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function AuditNavIcon({ className }: { className?: string }) {
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
      <path d="M12 8v4l3 3" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function MembersNavIcon({ className }: { className?: string }) {
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
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
