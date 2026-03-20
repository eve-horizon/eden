import { useMembers, type ProjectMember } from '../../hooks/useMembers';

// ---------------------------------------------------------------------------
// MembersPanel — slide-over panel for viewing and managing project members.
//
// Owners see role-change dropdowns and remove buttons.
// Editors and viewers see a read-only member list.
// Invite action is handled by the InviteModal (not duplicated here).
// ---------------------------------------------------------------------------

interface MembersPanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
}

const ROLE_OPTIONS = ['owner', 'editor', 'viewer'] as const;

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  owner: { bg: '#dbeafe', text: '#1e40af' },
  editor: { bg: '#d1fae5', text: '#065f46' },
  viewer: { bg: '#f3f4f6', text: '#6b7280' },
};

export function MembersPanel({ projectId, open, onClose, isOwner }: MembersPanelProps) {
  const { members, loading, updateRole, remove } = useMembers(projectId);

  if (!open) return null;

  const handleRemove = async (member: ProjectMember) => {
    const label = member.email || member.user_id;
    if (!confirm(`Remove ${label} from this project?`)) return;
    try {
      await remove(member.id);
    } catch {
      // Silently fail
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 50,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          maxWidth: '100vw',
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        data-testid="members-panel"
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e5e9',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: '#1a1a2e',
            }}
          >
            Project Members
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#6b7280',
              fontSize: '18px',
              lineHeight: 1,
            }}
            aria-label="Close members panel"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 20px',
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 0',
                color: '#6b7280',
                fontSize: '13px',
              }}
            >
              Loading members...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {members.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px 0',
                    color: '#9ca3af',
                    fontSize: '13px',
                  }}
                >
                  No members yet.
                </div>
              )}

              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isOwner={isOwner}
                  onRoleChange={(role) => updateRole(member.id, role)}
                  onRemove={() => handleRemove(member)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// MemberRow — single member with role badge + owner controls
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  isOwner,
  onRoleChange,
  onRemove,
}: {
  member: ProjectMember;
  isOwner: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
}) {
  const roleColor = ROLE_COLORS[member.role] ?? { bg: '#f3f4f6', text: '#6b7280' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 12px',
        background: '#fff',
        border: '1px solid #e2e5e9',
        borderRadius: '8px',
      }}
      data-testid={`member-row-${member.id}`}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#e2e5e9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          color: '#6b7280',
          flexShrink: 0,
        }}
      >
        {(member.email?.[0] ?? member.user_id[0] ?? '?').toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#1a1a2e',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {member.email || member.user_id}
        </div>
        {member.invited_by && (
          <div
            style={{
              fontSize: '10px',
              color: '#9ca3af',
              marginTop: '2px',
            }}
          >
            Invited by {member.invited_by}
          </div>
        )}
      </div>

      {isOwner ? (
        <select
          value={member.role}
          onChange={(e) => onRoleChange(e.target.value)}
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '6px',
            border: '1px solid #e2e5e9',
            background: roleColor.bg,
            color: roleColor.text,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          data-testid={`role-select-${member.id}`}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
      ) : (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '6px',
            background: roleColor.bg,
            color: roleColor.text,
            flexShrink: 0,
          }}
        >
          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
        </span>
      )}

      {isOwner && (
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: '#9ca3af',
            fontSize: '14px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Remove member"
          data-testid={`remove-member-${member.id}`}
        >
          &times;
        </button>
      )}
    </div>
  );
}
