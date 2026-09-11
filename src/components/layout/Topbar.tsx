import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { NotificationCenter } from './NotificationCenter.tsx';
import { DatabasePopover } from './DatabasePopover.tsx';
import { PersonaSwitcher } from '../common/PersonaSwitcher.tsx';
import {
  Menu,
  Bell,
  Database,
  Lock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Settings,
  User as UserIcon,
  ChevronDown,
  Building2,
  Shield,
  Key,
} from 'lucide-react';

interface TopbarProps {
  onToggleMobileMenu: () => void;
  onNavigate: (view: string) => void;
}

export function Topbar({ onToggleMobileMenu, onNavigate }: TopbarProps) {
  const { user, logout } = useAuth();
  const { activeDataset, isDbConnected, unreadCount } = useData();

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDbPopoverOpen, setIsDbPopoverOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.membership?.role === 'ORG_ADMIN';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isUserMenuOpen]);

  return (
    <header
      id="app-topbar"
      className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none"
    >
      {/* Left: Mobile menu toggle, Organization & Active Dataset context badge */}
      <div className="flex items-center gap-3">
        <button
          id="mobile-menu-toggle-btn"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          {user?.organization && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 text-xs text-purple-900 dark:text-purple-200">
              <Building2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="font-semibold truncate max-w-[130px]">
                {user.organization.name}
              </span>
              <span className={`text-[10px] font-bold px-1 rounded ${
                isAdmin
                  ? 'bg-purple-200/80 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
            <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-[180px]">
              {activeDataset ? activeDataset.display_name : 'No dataset loaded'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Persona Switcher, DB status, Notifications, User Menu */}
      <div className="flex items-center gap-2.5">
        {/* Instant Persona Switcher for testing RBAC & Multi-tenancy */}
        <PersonaSwitcher />

        {/* Database connectivity popover trigger */}
        <div className="relative">
          <button
            id="db-status-trigger-btn"
            onClick={() => {
              setIsDbPopoverOpen(!isDbPopoverOpen);
              setIsNotificationsOpen(false);
              setIsUserMenuOpen(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            {isDbConnected ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            )}
            <span className="hidden xl:inline text-slate-700 dark:text-slate-300">
              {isDbConnected ? 'PostgreSQL Active' : 'DB Disconnected'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          <DatabasePopover
            isOpen={isDbPopoverOpen}
            onClose={() => setIsDbPopoverOpen(false)}
            onNavigate={onNavigate}
          />
        </div>

        {/* Notification Bell trigger */}
        <div className="relative">
          <button
            id="notifications-trigger-btn"
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              setIsDbPopoverOpen(false);
              setIsUserMenuOpen(false);
            }}
            className="relative p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          <NotificationCenter
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            onNavigate={onNavigate}
          />
        </div>

        {/* User Avatar & Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            id="user-menu-trigger-btn"
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsNotificationsOpen(false);
              setIsDbPopoverOpen(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <span className="hidden lg:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
              {user?.name || 'Account'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden lg:inline" />
          </button>

          {isUserMenuOpen && (
            <div
              id="user-dropdown-menu"
              className="absolute right-0 top-12 w-56 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 py-1 z-50 text-xs"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                {user?.organization && (
                  <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-1">
                    {user.organization.name} ({isAdmin ? 'Admin' : 'Member'})
                  </p>
                )}
              </div>

              {isAdmin && (
                <button
                  id="user-menu-admin-btn"
                  onClick={() => {
                    onNavigate('admin');
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center gap-2 transition-colors font-semibold"
                >
                  <Shield className="w-3.5 h-3.5 text-purple-600" />
                  <span>Admin Workspace</span>
                </button>
              )}

              <button
                id="user-menu-settings-btn"
                onClick={() => {
                  onNavigate('settings');
                  setIsUserMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Account & Settings</span>
              </button>

              <button
                id="user-menu-logout-btn"
                onClick={async () => {
                  setIsUserMenuOpen(false);
                  await logout();
                }}
                className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 transition-colors border-t border-slate-100 dark:border-slate-800 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
