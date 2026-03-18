import { useParams } from 'react-router-dom';
import { useProjectRole } from '../hooks/useProjectRole';
import { useMembers, type ProjectMember } from '../hooks/useMembers';
import { useState } from 'react';
import { InviteModal } from '../components/projects/InviteModal';

// ---------------------------------------------------------------------------
// MembersPage — full-page project member management.
// Owners can invite, change roles, and remove. Others see read-only list.
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = ['owner', 'editor', 'viewer'] as const;

const DEFAULT_ROLE_COLOR = { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  editor: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  viewer: DEFAULT_ROLE_COLOR,
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? DEFAULT_ROLE_COLOR;
}

export function MembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isOwner } = useProjectRole(projectId);
  const { members, loading, invite, updateRole, remove } = useMembers(projectId);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // InviteModal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  if (!projectId) return null;

  const handleInvite = async () => {
    if (!inviteEmail.trim() && !inviteUserId.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      await invite(inviteUserId.trim(), inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInviteUserId('');
      setInviteRole('editor');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (member: ProjectMember) => {
    const label = member.email || member.user_id;
    if (!confirm(`Remove ${label} from this project?`)) return;
    try { await remove(member.id); } catch { /* */ }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-eden-text">Project Members</h2>
          {isOwner && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold
                         bg-eden-accent text-white hover:opacity-90 transition-opacity"
              data-testid="open-invite-modal-btn"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
              </svg>
              Invite Member
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-eden-text-2 text-sm">Loading members...</div>
        ) : (
          <>
            {/* Member list */}
            <div className="space-y-2 mb-8">
              {members.length === 0 && (
                <div className="text-center py-8 text-eden-text-2 text-sm">
                  No explicit members yet. Org owners and admins have owner access by default.
                </div>
              )}

              {members.map((member) => {
                const rc = roleColor(member.role);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-eden-surface border border-eden-border rounded-lg"
                    data-testid={`member-row-${member.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-eden-bg flex items-center justify-center text-xs font-bold text-eden-text-2 flex-shrink-0">
                      {(member.email?.[0] ?? member.user_id[0] ?? '?').toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-eden-text truncate">
                        {member.email || member.user_id}
                      </div>
                      {member.invited_by && (
                        <div className="text-[10px] text-eden-text-2 mt-0.5">
                          Invited by {member.invited_by}
                        </div>
                      )}
                    </div>

                    {isOwner ? (
                      <select
                        value={member.role}
                        onChange={(e) => updateRole(member.id, e.target.value)}
                        className="text-xs font-semibold px-2 py-1 rounded-md border cursor-pointer flex-shrink-0"
                        style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}
                        data-testid={`role-select-${member.id}`}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-md flex-shrink-0"
                        style={{ background: rc.bg, color: rc.text }}
                      >
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                    )}

                    {isOwner && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="text-eden-text-2 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                        title="Remove member"
                        data-testid={`remove-member-${member.id}`}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Invite form — owner only */}
            {isOwner && (
              <div className="p-4 bg-eden-bg rounded-xl border border-eden-border">
                <h3 className="text-sm font-bold text-eden-text mb-3">Invite Member</h3>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="User ID"
                    value={inviteUserId}
                    onChange={(e) => setInviteUserId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-eden-border text-sm outline-none focus:border-eden-accent"
                    data-testid="invite-user-id"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-eden-border text-sm outline-none focus:border-eden-accent"
                    data-testid="invite-email"
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-eden-border text-sm cursor-pointer"
                      data-testid="invite-role"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleInvite}
                      disabled={inviting || (!inviteEmail.trim() && !inviteUserId.trim())}
                      className="px-4 py-2 rounded-lg bg-eden-accent text-white text-sm font-semibold
                        disabled:opacity-50 hover:opacity-90 transition-opacity whitespace-nowrap"
                      data-testid="invite-btn"
                    >
                      {inviting ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                  {inviteError && (
                    <div className="text-xs text-red-600 mt-1">{inviteError}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Invite Modal */}
      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onInvite={invite}
      />
    </div>
  );
}
