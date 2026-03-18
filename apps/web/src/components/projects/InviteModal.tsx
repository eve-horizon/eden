import { useState } from 'react';

// ---------------------------------------------------------------------------
// InviteModal — modal dialog for inviting a member to a project.
//
// Email input + role picker. Posts to the parent's invite callback.
// Dismissible via backdrop click or Escape key.
// ---------------------------------------------------------------------------

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvite: (userId: string, email: string, role: string) => Promise<void>;
}

const ROLE_OPTIONS = ['owner', 'editor', 'viewer'] as const;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Full access. Can manage members, approve changes, and edit the map.',
  editor: 'Can edit the map, create changesets, and answer questions.',
  viewer: 'Read-only access. Can browse the map and export data.',
};

export function InviteModal({ open, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<string>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canSubmit = (email.trim() || userId.trim()) && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await onInvite(userId.trim(), email.trim(), role);
      // Reset and close on success
      setEmail('');
      setUserId('');
      setRole('editor');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md bg-eden-surface rounded-eden shadow-modal
                   border border-eden-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="invite-modal"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-eden-border flex items-center justify-between">
          <h2 className="text-base font-bold text-eden-text">Invite Member</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-eden-text-2 hover:text-eden-text transition-colors"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-eden-text mb-1.5">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              autoFocus
              className="w-full rounded-lg border border-eden-border bg-white px-3 py-2 text-sm
                         text-eden-text placeholder:text-eden-text-2 outline-none
                         focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent transition-colors"
              data-testid="invite-email-input"
            />
          </div>

          <div>
            <label htmlFor="invite-user-id" className="block text-sm font-medium text-eden-text mb-1.5">
              User ID <span className="text-eden-text-2 font-normal">(optional)</span>
            </label>
            <input
              id="invite-user-id"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="user_abc123"
              className="w-full rounded-lg border border-eden-border bg-white px-3 py-2 text-sm font-mono
                         text-eden-text placeholder:text-eden-text-2 outline-none
                         focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent transition-colors"
              data-testid="invite-user-id-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-eden-text mb-2">
              Role
            </label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${role === r
                      ? 'border-eden-accent bg-eden-accent/5'
                      : 'border-eden-border hover:border-eden-accent/40'
                    }`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    className="mt-0.5 accent-eden-accent"
                  />
                  <div>
                    <span className="text-sm font-semibold text-eden-text capitalize">{r}</span>
                    <p className="text-[11px] text-eden-text-2 mt-0.5">
                      {ROLE_DESCRIPTIONS[r]}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-eden-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-eden-text-2
                       hover:bg-eden-bg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-eden-accent text-white
                       disabled:opacity-50 hover:opacity-90 transition-opacity"
            data-testid="invite-submit-btn"
          >
            {submitting ? 'Inviting...' : 'Send Invite'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG
// ---------------------------------------------------------------------------

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
