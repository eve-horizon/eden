import { EveAuthProvider, useEveAuth } from '@eve-horizon/auth-react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { MapPage } from './pages/MapPage';
import { QuestionsPage } from './pages/QuestionsPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { ChangesetsPage } from './pages/ChangesetsPage';
import { SourcesPage } from './pages/SourcesPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { AuditPage } from './pages/AuditPage';
import { MembersPage } from './pages/MembersPage';
import { useProject } from './hooks/useProjects';
import { useClaimInvite } from './hooks/useClaimInvite';
import { useProjectRole } from './hooks/useProjectRole';

// ---------------------------------------------------------------------------
// ProjectShell — wraps project-scoped routes with project context in AppShell
// ---------------------------------------------------------------------------

function ProjectShell({
  user,
  onLogout,
  children,
}: {
  user: { id: string; email: string; orgId: string; role: 'owner' | 'admin' | 'member'; organizations?: Array<{ id: string; role: string }> };
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProject(projectId);
  const { refetch: refetchRole } = useProjectRole(projectId);

  // Auto-claim any pending invite on first project access
  useClaimInvite(projectId, () => {
    refetchRole();
  });

  return (
    <AppShell
      user={user}
      onLogout={onLogout}
      projectId={projectId}
      projectName={project?.name}
    >
      {children}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// DeepLinkRedirect — handles ?project=<id> from invite onboarding flow
// ---------------------------------------------------------------------------

function DeepLinkRedirect({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const deepLinkProject = searchParams.get('project');

  useEffect(() => {
    if (deepLinkProject) {
      navigate(`/projects/${deepLinkProject}/map`, { replace: true });
    }
  }, [deepLinkProject, navigate]);

  if (deepLinkProject) return null; // Will redirect
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-eden-bg flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-eden bg-eden-header flex items-center justify-center">
            <span className="text-white font-extrabold text-lg">E</span>
          </div>
          <span className="text-2xl font-extrabold text-eden-text tracking-tight">
            Eden
          </span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-eden-accent animate-bounce [animation-delay:-0.3s]" />
          <div className="w-2 h-2 rounded-full bg-eden-accent animate-bounce [animation-delay:-0.15s]" />
          <div className="w-2 h-2 rounded-full bg-eden-accent animate-bounce" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthGate — auth check + routing
// ---------------------------------------------------------------------------

function AuthGate() {
  const { user, loading, error, loginWithToken, loginWithSso, logout } =
    useEveAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <LoginPage
        onLoginWithToken={loginWithToken}
        onStartSsoLogin={loginWithSso}
        loading={loading}
        error={error}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Projects list — no project context */}
        {/* DeepLinkRedirect handles ?project=<id> from invite onboarding flow */}
        <Route
          path="/"
          element={
            <AppShell user={user} onLogout={logout}>
              <DeepLinkRedirect>
                <ProjectsPage />
              </DeepLinkRedirect>
            </AppShell>
          }
        />

        {/* Project-scoped routes */}
        <Route
          path="/projects/:projectId/*"
          element={
            <ProjectShell user={user} onLogout={logout}>
              <Routes>
                <Route path="map" element={<MapPage />} />
                <Route path="qa" element={<QuestionsPage />} />
                <Route path="releases" element={<ReleasesPage />} />
                <Route path="changes" element={<ChangesetsPage />} />
                <Route path="reviews" element={<ReviewsPage />} />
                <Route path="sources" element={<SourcesPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="members" element={<MembersPage />} />
                <Route path="*" element={<Navigate to="map" replace />} />
              </Routes>
            </ProjectShell>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <EveAuthProvider apiUrl="/api">
      <AuthGate />
    </EveAuthProvider>
  );
}
