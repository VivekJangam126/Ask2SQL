import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import {
  Settings,
  User,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  Database,
  ShieldCheck,
  LogOut,
  Info,
} from 'lucide-react';
import { api } from '../../lib/api.ts';

export function SettingsView() {
  const { user, updateProfile, logout } = useAuth();
  const { isDbConnected, dbEngine, aiModel } = useData();

  const [name, setName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Appearance theme state
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      return (localStorage.getItem('claritysql_theme') as any) || 'system';
    } catch {
      return 'system';
    }
  });

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  const handleThemeChange = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    localStorage.setItem('claritysql_theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (t === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await updateProfile(name.trim());
      setFeedback('Profile updated successfully.');
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <span>Account & System Settings</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Profile preferences, UI appearance, and database runtime diagnostics
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">
            User Profile
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Read-only primary key
              </span>
            </div>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full text-xs p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 cursor-not-allowed font-mono"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              id="save-profile-btn"
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Appearance Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Sun className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">
            Interface Theme
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleThemeChange('light')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all ${
              theme === 'light'
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sun className="w-5 h-5" />
            <span className="text-xs font-semibold">Light</span>
          </button>

          <button
            onClick={() => handleThemeChange('dark')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all ${
              theme === 'dark'
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Moon className="w-5 h-5" />
            <span className="text-xs font-semibold">Dark</span>
          </button>

          <button
            onClick={() => handleThemeChange('system')}
            className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all ${
              theme === 'system'
                ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Laptop className="w-5 h-5" />
            <span className="text-xs font-semibold">System</span>
          </button>
        </div>
      </div>

      {/* Diagnostics Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="font-bold text-sm text-slate-900 dark:text-white">
            Database & System Runtime
          </h2>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">Database Engine</span>
            <span className="font-medium font-mono text-slate-800 dark:text-slate-200">
              {dbEngine}
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">SQL Validator</span>
            <span className="font-medium font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              pgsql-ast-parser (Strict Read-Only)
            </span>
          </div>

          <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-slate-500">AI Model</span>
            <span className="font-medium font-mono text-slate-800 dark:text-slate-200">
              {aiModel ? (aiModel.charAt(0).toUpperCase() + aiModel.slice(1)).replace('-', ' ') : 'Gemini 3.8 Flash'}
            </span>
          </div>

          <div className="flex justify-between py-1.5">
            <span className="text-slate-500">Execution Timeout</span>
            <span className="font-medium font-mono text-slate-800 dark:text-slate-200">
              10,000ms max
            </span>
          </div>
        </div>
      </div>

      {/* Sign Out Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-100 dark:border-rose-950/40 p-6 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Sign Out of Session
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Terminates the current authenticated session cookie.
          </p>
        </div>

        <button
          id="settings-logout-btn"
          onClick={() => setShowLogoutConfirm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-900/60 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Sign out of ClaritySQL?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You will need to sign in again with your email and password to access your datasets.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await logout();
                }}
                className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
