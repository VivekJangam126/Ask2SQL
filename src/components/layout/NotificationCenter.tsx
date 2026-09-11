import React, { useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext.tsx';
import { Bell, CheckCheck, Database, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (view: string) => void;
}

export function NotificationCenter({ isOpen, onClose, onNavigate }: NotificationCenterProps) {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useData();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      id="notification-center-panel"
      className="absolute right-0 top-12 w-84 sm:w-96 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            id="mark-all-read-btn"
            onClick={() => markAllNotificationsRead()}
            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium flex items-center gap-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No notifications yet.</p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              id={`notification-item-${n.id}`}
              onClick={() => {
                if (!n.is_read) markNotificationRead(n.id);
                if (n.related_entity_type === 'dataset' && onNavigate) onNavigate('database');
                if (n.related_entity_type === 'analysis' && onNavigate) onNavigate('history');
                onClose();
              }}
              className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer transition-colors ${
                !n.is_read ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {n.event_type.includes('success') || n.event_type.includes('ready') ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : n.event_type.includes('failed') ? (
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  ) : (
                    <Database className="w-4 h-4 text-indigo-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={`text-xs font-semibold ${!n.is_read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {n.title}
                    </p>
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {n.message}
                  </p>
                </div>
                {!n.is_read && (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 mt-1.5 shrink-0" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
