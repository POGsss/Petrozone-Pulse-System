import { useState, useEffect, useRef, useCallback } from "react";
import { LuBell, LuCheck, LuCheckCheck, LuSettings } from "react-icons/lu";
import { notificationsApi } from "../lib/api";
import { showToast } from "../lib/toast";
import { useAuth } from "../auth";
import { Modal, ModalSection, ModalInput } from "./Modal";
import type { NotificationReceipt } from "../types";

interface NotificationDropdownProps {
  onViewAll?: () => void;
}

export function NotificationDropdown({ onViewAll }: NotificationDropdownProps) {
  const { user } = useAuth();
  const userRoles = user?.roles || [];
  const canManageNotifications = userRoles.some((r) => ["HM", "POC", "JS"].includes(r));
  const [isOpen, setIsOpen] = useState(false);
  const [receipts, setReceipts] = useState<NotificationReceipt[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [viewReceipt, setViewReceipt] = useState<NotificationReceipt | null>(null);

  // Fetch unread count periodically
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationsApi.getUnreadCount();
      setUnreadCount(data.unread_count);
    } catch {
      // Silent fail – header component shouldn't show errors
    }
  }, []);

  // Fetch recent notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notificationsApi.getMy({ limit: 10 });
      setReceipts(data.data || []);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30s
    // Listen for scheduled notification completions to refresh immediately
    const handleScheduleComplete = () => {
      fetchUnreadCount();
      if (isOpen) fetchNotifications();
    };
    window.addEventListener("notification-schedule-complete", handleScheduleComplete);
    return () => {
      clearInterval(interval);
      window.removeEventListener("notification-schedule-complete", handleScheduleComplete);
    };
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleMarkAsRead(receiptId: string, notificationId: string) {
    try {
      await notificationsApi.markAsRead(notificationId);
      setReceipts(prev =>
        prev.map(r =>
          r.id === receiptId ? { ...r, is_read: true, read_at: new Date().toISOString() } : r
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      showToast.error("Failed to mark as read");
    }
  }

  async function handleMarkAllRead() {
    try {
      await notificationsApi.markAllAsRead();
      setReceipts(prev =>
        prev.map(r => ({ ...r, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
      showToast.success("All notifications marked as read");
    } catch {
      showToast.error("Failed to mark all as read");
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-neutral-900 hover:text-neutral-950 transition-colors"
      >
        <LuBell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-negative text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg border border-neutral-200 z-10 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <h3 className="font-semibold text-neutral-950 text-sm">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:text-primary-900 font-medium flex items-center gap-1"
                  title="Mark all as read"
                >
                  <LuCheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              {canManageNotifications && onViewAll && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onViewAll();
                  }}
                  className="p-1 text-neutral-900 hover:text-neutral-950"
                  title="Notification Settings"
                >
                  <LuSettings className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-neutral-900 text-sm">Loading...</div>
            ) : receipts.length === 0 ? (
              <div className="p-6 text-center text-neutral-900 text-sm">
                No notifications yet
              </div>
            ) : (
              receipts.map((receipt) => {
                const notif = receipt.notifications;
                if (!notif) return null;
                return (
                  <div
                    key={receipt.id}
                    onClick={() => {
                      setViewReceipt(receipt);
                      if (!receipt.is_read) {
                        handleMarkAsRead(receipt.id, receipt.notification_id);
                      }
                    }}
                    className={`px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-100 transition-colors cursor-pointer ${
                      !receipt.is_read ? "bg-primary-200" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!receipt.is_read && (
                            <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></span>
                          )}
                          <p className="text-sm font-medium text-neutral-950 truncate">
                            {notif.title}
                          </p>
                        </div>
                        <p className="text-xs text-neutral-900 mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-primary-900">
                            {formatTime(receipt.delivered_at)}
                          </span>
                          {notif.notification_type === "system" && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-900 rounded">
                              System
                            </span>
                          )}
                        </div>
                      </div>
                      {!receipt.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(receipt.id, receipt.notification_id);
                          }}
                          className="p-1 text-neutral-400 hover:text-positive transition-colors flex-shrink-0"
                          title="Mark as read"
                        >
                          <LuCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* View Notification Detail Modal */}
      <Modal
        isOpen={!!viewReceipt && !!viewReceipt.notifications}
        onClose={() => setViewReceipt(null)}
        title="Notification Details"
      >
        {viewReceipt?.notifications && (
          <div>
            <ModalSection
              title="Basic Information">
              <ModalInput
                type="text"
                value={viewReceipt.notifications.title}
                onChange={() => {}}
                placeholder="Title"
                disabled
              />
              <textarea
                value={viewReceipt.notifications.message}
                readOnly
                rows={3}
                className="w-full px-4 py-3.5 bg-neutral-100 rounded-xl text-neutral-950 text-sm resize-none focus:outline-none"
              />
            </ModalSection>
          </div>
        )}
      </Modal>
    </div>
  );
}
