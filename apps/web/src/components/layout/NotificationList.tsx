import { useNavigate } from 'react-router-dom';
import type { Notification } from './NotificationBell';

// ---------------------------------------------------------------------------
// NotificationList — dropdown list of recent notifications.
//
// Shows title, relative time, and read/unread state. Click navigates to the
// entity (if available) and marks as read. "Mark all read" button at top.
// ---------------------------------------------------------------------------

interface NotificationListProps {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

export function NotificationList({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: NotificationListProps) {
  const navigate = useNavigate();

  const handleClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }

    // Navigate based on entity type
    if (notification.entity_type && notification.entity_id) {
      const route = buildRoute(notification.entity_type, notification.entity_id);
      if (route) {
        navigate(route);
        onClose();
      }
    }
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 max-h-96 rounded-eden bg-eden-surface
                 shadow-modal border border-eden-border flex flex-col overflow-hidden z-50"
      data-testid="notification-list"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-eden-border">
        <h3 className="text-sm font-semibold text-eden-text">Notifications</h3>
        {hasUnread && (
          <button
            onClick={onMarkAllRead}
            className="text-[10px] font-medium text-eden-accent hover:text-eden-accent/80 transition-colors"
            data-testid="mark-all-read-btn"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-eden-text-2">No notifications yet.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleClick(notification)}
              className={`w-full text-left px-4 py-3 border-b border-eden-border/50
                         hover:bg-eden-bg transition-colors flex items-start gap-3
                         ${notification.read ? 'opacity-60' : ''}`}
              data-testid={`notification-item-${notification.id}`}
            >
              {/* Unread dot */}
              <div className="flex-shrink-0 mt-1.5">
                {!notification.read ? (
                  <span className="block w-2 h-2 rounded-full bg-eden-accent" />
                ) : (
                  <span className="block w-2 h-2" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-eden-text leading-snug truncate">
                  {notification.title}
                </p>
                {notification.body && (
                  <p className="text-[10px] text-eden-text-2 mt-0.5 line-clamp-2">
                    {notification.body}
                  </p>
                )}
                <p className="text-[9px] text-eden-text-2 mt-1">
                  {timeAgo(notification.created_at)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildRoute(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'changeset':
      return `/projects/${entityId}/changes`;
    case 'question':
      return `/projects/${entityId}/qa`;
    case 'task':
    case 'activity':
    case 'step':
      return `/projects/${entityId}/map`;
    default:
      return null;
  }
}
