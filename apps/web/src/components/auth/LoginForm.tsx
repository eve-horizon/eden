import { useState } from 'react';

interface LoginFormProps {
  onLoginWithToken: (token: string) => void;
  onStartSsoLogin: () => void;
  loading: boolean;
  error: string | null;
}

export function LoginForm({
  onLoginWithToken,
  onStartSsoLogin,
  loading,
  error,
}: LoginFormProps) {
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<'sso' | 'token'>('sso');

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (trimmed) {
      onLoginWithToken(trimmed);
    }
  };

  return (
    <div className="min-h-screen bg-eden-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-eden bg-eden-header flex items-center justify-center shadow-card">
              <span className="text-white font-extrabold text-2xl">E</span>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-eden-text tracking-[-0.5px]">
            Eden
          </h1>
          <p className="text-sm text-eden-text-2 mt-1">
            AI-first requirements platform
          </p>
        </div>

        {/* Login card */}
        <div className="eden-card p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === 'sso' ? (
            <div className="space-y-4">
              <button
                onClick={onStartSsoLogin}
                disabled={loading}
                className="eden-btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Connecting...
                  </span>
                ) : (
                  'Sign in with Eve SSO'
                )}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-eden-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-eden-surface px-3 text-eden-text-2">
                    or
                  </span>
                </div>
              </div>

              <button
                onClick={() => setMode('token')}
                className="eden-btn-secondary w-full"
              >
                Paste CLI token
              </button>
            </div>
          ) : (
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="token"
                  className="block text-sm font-medium text-eden-text mb-1.5"
                >
                  Eve CLI Token
                </label>
                <input
                  id="token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your token here..."
                  autoFocus
                  className="w-full rounded-lg border border-eden-border bg-eden-surface
                             px-3 py-2.5 text-sm text-eden-text placeholder:text-eden-text-2
                             focus:outline-none focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent
                             transition-colors"
                />
                <p className="mt-1.5 text-xs text-eden-text-2">
                  Run{' '}
                  <code className="rounded bg-eden-bg px-1.5 py-0.5 font-mono text-eden-accent">
                    eve auth token
                  </code>{' '}
                  in your terminal to get a token.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="eden-btn-primary w-full py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Authenticating...' : 'Sign in'}
              </button>

              <button
                type="button"
                onClick={() => setMode('sso')}
                className="eden-btn-secondary w-full"
              >
                Back to SSO
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-eden-text-2 mt-6">
          Powered by Eve Horizon
        </p>
      </div>
    </div>
  );
}
