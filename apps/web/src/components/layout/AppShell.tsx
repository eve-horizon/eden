import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

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

  const orgs = user.organizations ?? [];
  const currentOrgId = user.orgId;

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

            {/* Org Switcher */}
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
                  {currentOrgId ?? 'Select org'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-white/60" />
              </button>

              {orgOpen && orgs.length > 1 && (
                <div className="absolute left-0 top-full mt-1 w-56 rounded-eden bg-eden-surface shadow-modal border border-eden-border py-1 z-50">
                  {orgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        // switchOrg would be called here via useEveAuth
                        setOrgOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-eden-bg transition-colors
                        ${org.id === currentOrgId ? 'text-eden-accent font-semibold' : 'text-eden-text'}`}
                    >
                      {org.id}
                      {org.id === currentOrgId && (
                        <span className="float-right text-eden-accent">
                          &check;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* User menu */}
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

          <div className="px-3 py-4 border-t border-eden-border">
            <p className="text-[10px] font-medium uppercase tracking-wider text-eden-text-2">
              Phase 1 — Foundation
            </p>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
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
