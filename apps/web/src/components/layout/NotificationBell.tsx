import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { NotificationList } from './NotificationList';

// ---------------------------------------------------------------------------
// NotificationBell — bell icon in the header with unread count badge.
//
// Polls GET /notifications every 30 seconds. Red badge with count when
// unread > 0. Click toggles the NotificationList dropdown.
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<Notification[]>('/notifications');
      setNotifications(data);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkRead = useCallback(
    async (id: string) => {
      try {
        await api.patch(`/notifications/${id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
      } catch {
        // Silently fail
      }
    },
    [],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg
                   text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        title="Notifications"
        data-testid="notification-bell"
      >
        <BellIcon className="w-5 h-5" />

        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center
                       min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white
                       text-[9px] font-bold leading-none"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationList
          notifications={notifications}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG
// ---------------------------------------------------------------------------

function BellIcon({ className }: { className?: string }) {
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
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
