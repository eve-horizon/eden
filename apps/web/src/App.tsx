import { EveAuthProvider, useEveAuth } from '@eve-horizon/auth-react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { MapPage } from './pages/MapPage';
import { QuestionsPage } from './pages/QuestionsPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { useProject } from './hooks/useProjects';

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
        <Route
          path="/"
          element={
            <AppShell user={user} onLogout={logout}>
              <ProjectsPage />
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
