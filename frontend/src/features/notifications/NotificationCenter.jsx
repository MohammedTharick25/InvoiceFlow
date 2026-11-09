import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/apiClient.js";

export function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [notificationResponse, statusResponse] = await Promise.all([
        apiClient.get("/notifications", { params: { page: 1, limit: 5 } }),
        apiClient.get("/reminders/status"),
      ]);
      setNotifications(notificationResponse.data.notifications ?? []);
      setUnread(notificationResponse.data.unread ?? 0);
      setHealth(statusResponse.data.status);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Notifications are unavailable.",
      );
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  async function markRead(notification) {
    try {
      await apiClient.patch(`/notifications/${notification.id}/read`);
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not update this notification.",
      );
    }
  }

  async function markAllRead() {
    try {
      await apiClient.post("/notifications/read-all");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.error?.message ??
          "Could not update notifications.",
      );
    }
  }

  return (
    <section
      className="mb-5 rounded-2xl border border-line bg-surface p-4 dark:border-slate-800 dark:bg-slate-900"
      aria-label="Notifications"
    >
      {health && !health.healthy && (
        <p
          role="status"
          className="mb-3 text-sm text-amber-800 dark:text-amber-200"
        >
          Reminder service needs attention: {health.dueUnprocessed} due and{" "}
          {health.failed} failed.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink dark:text-white">
          Notifications{" "}
          {unread > 0 && (
            <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {unread} new
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            className="text-sm font-medium text-brand-700 underline dark:text-brand-300"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="mt-2 text-sm text-muted dark:text-slate-300">
          No notifications yet.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line dark:divide-slate-800">
          {notifications.map((notification) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              key={notification.id}
            >
              <div>
                <p className="text-sm font-medium text-ink dark:text-white">
                  {notification.title}
                </p>
                <p className="text-sm text-muted">{notification.body}</p>
              </div>
              {!notification.readAt && (
                <button
                  type="button"
                  className="text-xs text-brand-700 underline dark:text-brand-300"
                  onClick={() => markRead(notification)}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
