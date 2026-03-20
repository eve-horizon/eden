import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrgMemberSearch, type OrgMember } from '../../hooks/useOrgMemberSearch';
import type { InviteResult } from '../../hooks/useInvite';

// ---------------------------------------------------------------------------
// InviteModal — smart invite dialog with org member typeahead.
//
// - Types email → searches org members via Eve API
// - Match found → "Add to Project" (instant)
// - No match → "Send Invite" (sends email via platform)
// - Shows success feedback before closing
// ---------------------------------------------------------------------------

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<InviteResult>;
}

const ROLE_OPTIONS = ['owner', 'editor', 'viewer'] as const;

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Full access. Can manage members, approve changes, and edit the map.',
  editor: 'Can edit the map, create changesets, and answer questions.',
  viewer: 'Read-only access. Can browse the map and export data.',
};

export function InviteModal({ open, onClose, onInvite }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('editor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Typeahead
  const { results, searching, search, clear } = useOrgMemberSearch();
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setEmail('');
      setRole('editor');
      setError(null);
      setSuccessMsg(null);
      setSelectedMember(null);
      clear();
    }
  }, [open, clear]);

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value);
      setSelectedMember(null);
      setError(null);
      setSuccessMsg(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length >= 2) {
        debounceRef.current = setTimeout(() => {
          search(value.trim());
          setShowDropdown(true);
        }, 300);
      } else {
        clear();
        setShowDropdown(false);
      }
    },
    [search, clear],
  );

  const handleSelectMember = useCallback((member: OrgMember) => {
    setEmail(member.email);
    setSelectedMember(member);
    setShowDropdown(false);
  }, []);

  if (!open) return null;

  const isExistingMember = selectedMember !== null;
  const canSubmit = email.trim().length > 0 && !submitting && !successMsg;
  const buttonLabel = submitting
    ? 'Inviting...'
    : isExistingMember
      ? 'Add to Project'
      : 'Send Invite';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await onInvite(email.trim(), role);

      if (result.status === 'added') {
        setSuccessMsg(`${email} added as ${role}`);
      } else {
        setSuccessMsg(
          `Invite sent to ${email} — they'll join as ${role} after completing signup`,
        );
      }

      // Auto-close after showing feedback
      setTimeout(() => {
        onClose();
      }, 2000);
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
          {/* Success feedback */}
          {successMsg && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                successMsg.startsWith('Invite sent')
                  ? 'bg-blue-50 border border-blue-200 text-blue-700'
                  : 'bg-green-50 border border-green-200 text-green-700'
              }`}
              data-testid="invite-success"
            >
              {successMsg}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Email with typeahead */}
          <div className="relative">
            <label
              htmlFor="invite-email"
              className="block text-sm font-medium text-eden-text mb-1.5"
            >
              Email
            </label>
            <input
              ref={inputRef}
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onFocus={() => {
                if (results.length > 0 && !selectedMember) setShowDropdown(true);
              }}
              onBlur={() => {
                // Delay to allow click on dropdown item
                setTimeout(() => setShowDropdown(false), 200);
              }}
              placeholder="colleague@example.com"
              autoFocus
              disabled={!!successMsg}
              className="w-full rounded-lg border border-eden-border bg-white px-3 py-2 text-sm
                         text-eden-text placeholder:text-eden-text-2 outline-none
                         focus:ring-2 focus:ring-eden-accent/30 focus:border-eden-accent transition-colors
                         disabled:opacity-50"
              data-testid="invite-email-input"
            />

            {/* Selected member badge */}
            {selectedMember && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-md px-2 py-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
                {selectedMember.display_name || selectedMember.email} is in your org
                — will be added instantly
              </div>
            )}

            {/* Typeahead dropdown */}
            {showDropdown && !selectedMember && (
              <div
                className="absolute z-10 left-0 right-0 mt-1 bg-white border border-eden-border
                           rounded-lg shadow-lg max-h-48 overflow-auto"
                data-testid="member-search-dropdown"
              >
                {searching && results.length === 0 && (
                  <div className="px-3 py-2 text-xs text-eden-text-2">
                    Searching...
                  </div>
                )}
                {results.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-eden-bg flex items-center gap-2
                               transition-colors cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur
                      handleSelectMember(member);
                    }}
                    data-testid={`search-result-${member.email}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-eden-bg flex items-center justify-center text-[10px] font-bold text-eden-text-2 flex-shrink-0">
                      {(member.email[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-eden-text truncate">
                        {member.email}
                        {member.display_name && (
                          <span className="text-eden-text-2 ml-1">
                            — {member.display_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-eden-text-2 font-medium flex-shrink-0">
                      {member.role}
                    </span>
                  </button>
                ))}
                {!searching && results.length === 0 && email.trim().length >= 2 && (
                  <div className="px-3 py-2 text-xs text-eden-text-2">
                    Not in your org — will receive an invite email
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Role picker */}
          <div>
            <label className="block text-sm font-medium text-eden-text mb-2">
              Role
            </label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${
                      role === r
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
                    disabled={!!successMsg}
                    className="mt-0.5 accent-eden-accent"
                  />
                  <div>
                    <span className="text-sm font-semibold text-eden-text capitalize">
                      {r}
                    </span>
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
            {successMsg ? 'Close' : 'Cancel'}
          </button>
          {!successMsg && (
            <button
              type="submit"
              disabled={!canSubmit}
              className={`px-4 py-2 rounded-lg text-sm font-semibold text-white
                         disabled:opacity-50 hover:opacity-90 transition-opacity
                         ${isExistingMember ? 'bg-green-600' : 'bg-eden-accent'}`}
              data-testid="invite-submit-btn"
            >
              {buttonLabel}
            </button>
          )}
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
