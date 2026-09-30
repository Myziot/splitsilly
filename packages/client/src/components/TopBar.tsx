import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import { useEffect, useState } from 'react';

interface TopBarProps {
  /** Left-side content (simple pages, e.g. brand link). Used when the
   *  structured props below are not supplied. */
  children?: React.ReactNode;
  /** Structured slots — enable the responsive two/three-row mobile layout.
   *  When provided, desktop stays single-row; mobile stacks:
   *  row1 = back + logo + chrome, row2 = centered title/meta, row3 = subRow. */
  back?: React.ReactNode;
  /** Group name + currency pill etc. Centered on its own row on mobile. */
  title?: React.ReactNode;
  /** Full-width action row on mobile (e.g. Share invite). */
  subRow?: React.ReactNode;
  /** Minimal mode (e.g. the About page): hide the bell, user chip ("?")
   *  and logout button. Leaves only the logo + About link so a visitor
   *  isn't shown a zombie notification bell or auth controls. */
  minimal?: boolean;
}

function NotificationBell() {
  const { notifications, unreadCount, fetchNotifications, fetchUnreadCount, markRead } =
    useNotificationStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const byGroup = notifications.reduce((acc, n) => {
    const g = (n.payload?.groupName as string) || 'Other';
    (acc[g] ||= []).push(n);
    return acc;
  }, {} as Record<string, typeof notifications>);

  const handleOpen = (n: any) => {
    markRead(n.id);
    const tab = n.type === 'settlement_recorded' ? 'balances' : n.type === 'member_invited_pending' ? 'members' : 'expenses';
    setOpen(false);
    window.location.hash = `#/groups/${n.group_id}?tab=${tab}`;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full hover:bg-gray-100"
        aria-label="Notifications"
      >
        <svg
          className="h-6 w-6 text-gray-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {notifications.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No notifications</div>
          ) : (
            Object.entries(byGroup).map(([group, items]) => (
              <div key={group} className="border-b border-gray-100 last:border-0">
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group}
                </div>
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleOpen(n)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50 ${n.is_read ? 'opacity-50' : ''}`}
                  >
                    <div className="flex-1 text-sm">
                      {n.type === 'member_joined_review' && (
                        n.payload.optedOut ? (
                          <span>
                            <b>{n.payload.memberName}</b> joined but opted out of{' '}
                            {n.payload.expenseCount} of your expenses · review
                          </span>
                        ) : (
                          <span>
                            <b>{n.payload.memberName}</b> joined · {n.payload.expenseCount} of your
                            expenses need review
                          </span>
                        )
                      )}
                      {n.type === 'member_invited_pending' && (
                        <span>
                          <b>{n.payload.memberName}</b>{' '}
                          {n.payload.inMath
                            ? 'was added to the group (counts in the math now)'
                            : 'was invited (not joined yet · not in the math)'}
                        </span>
                      )}
                      {n.type === 'expense_added' && (
                        <span>
                          <b>{n.payload.memberName}</b> added “{n.payload.expenseDesc}”
                        </span>
                      )}
                      {n.type === 'settlement_recorded' && (
                        <span>
                          <b>{n.payload.payer}</b> settled with {n.payload.payee} (
                          {n.payload.currency} {n.payload.amount})
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-indigo-600 text-white">
                      go →
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Shared top navigation bar.
 * Always shows the logged-in user (name + email) on the right with a logout
 * button, so every authenticated page has a consistent user section.
 */
export default function TopBar({ children, back, title, subRow, minimal = false }: TopBarProps) {
  const { user, logout } = useAuthStore();

  const initials = (user?.name || user?.email || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const chrome = (
    <div className="flex items-center space-x-3">
      {!minimal && <NotificationBell />}
      {!minimal && (
        <div className="hidden sm:flex items-center space-x-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
            {initials}
          </div>
          <div className="text-right leading-tight">
            <div className="text-sm font-medium text-gray-900 truncate max-w-[160px]">
              {user?.name}
            </div>
            <div className="text-xs text-gray-500 truncate max-w-[160px]">{user?.email}</div>
          </div>
        </div>
      )}
      {!minimal && (
        <button
          onClick={() => logout()}
          className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          Logout
        </button>
      )}
      <a
        href="/about"
        className="hidden sm:inline-flex items-center text-sm font-medium text-gray-500 hover:text-blue-600"
      >
        About
      </a>
      {(user?.isAdmin || user?.is_admin) && (
        <Link
          to="/admin"
          className="hidden sm:inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Admin
        </Link>
      )}
    </div>
  );

  // Structured (group) layout: single-row on sm+, stacked on mobile.
  if (title) {
    return (
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Row 1: back (left) · logo (center, in-flow) · chrome (right).
              The logo sits in its own flex-1 centered column so it never
              overlaps the side content, even on landscape phones. */}
          <div className="relative flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center space-x-4 min-w-0 z-10">
              {back}
              {/* Desktop-only inline title (with subRow stacked beneath, as before) */}
              <div className="hidden sm:block min-w-0">
                {title}
                {subRow && <div className="mt-2">{subRow}</div>}
              </div>
            </div>
            {/* Centered logo column — flex-1 reserves space so no overlap. */}
            <div className="flex flex-1 justify-center items-center min-w-0 px-2 pointer-events-none">
              <img
                src="/nav_logo.png"
                alt="Split Silly"
                className="h-8 sm:h-10 w-auto max-h-14 object-contain"
              />
            </div>
            <div className="z-10 shrink-0">{chrome}</div>
          </div>

          {/* Mobile-only row 2: centered title/meta */}
          <div className="sm:hidden flex items-center justify-center gap-2 pb-1 -mt-1 min-w-0">
            {title}
          </div>

          {/* subRow: full-width on mobile; inline under title on desktop (unchanged) */}
          {subRow && <div className="sm:hidden pb-2">{subRow}</div>}
        </div>
      </nav>
    );
  }

  // Legacy single-row layout (simple pages passing children).
  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16 gap-2">
          <div className="flex items-center space-x-4 min-w-0 z-10">
            {children ?? (
              <Link to="/groups" className="text-xl font-bold text-gray-900 hover:text-blue-600">
                Splitsilly
              </Link>
            )}
          </div>
          {/* Centered logo column — flex-1 reserves space so no overlap. */}
          <div className="flex flex-1 justify-center items-center min-w-0 px-2 pointer-events-none">
            <img
              src="/nav_logo.png"
              alt="Split Silly"
              className="h-8 sm:h-10 w-auto max-h-14 object-contain"
            />
          </div>
          {chrome}
        </div>
      </div>
    </nav>
  );
}
