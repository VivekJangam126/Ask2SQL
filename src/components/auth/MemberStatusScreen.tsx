import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { PersonaSwitcher } from '../common/PersonaSwitcher.tsx';
import {
  Clock,
  Ban,
  UserX,
  Building2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export function MemberStatusScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const status = user?.membership?.status;
  const isSuspendedAccount = user?.account_state === 'suspended';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusDetails = () => {
    if (isSuspendedAccount || status === 'SUSPENDED') {
      return {
        title: 'Account Suspended',
        badge: 'Suspended',
        badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        icon: UserX,
        description: 'Your access to this organization has been temporarily suspended by an administrator. Please contact your organization administrator to restore access.',
      };
    }

    if (status === 'REJECTED') {
      return {
        title: 'Access Request Rejected',
        badge: 'Rejected',
        badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        icon: Ban,
        description: user?.membership?.rejectionReason
          ? `Your access request was declined with the following reason: "${user.membership.rejectionReason}"`
          : 'Your request to join this organization was declined by the administrator.',
      };
    }

    return {
      title: 'Access Request Pending Approval',
      badge: 'Pending Review',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      icon: Clock,
      description: 'Your request to access organization data has been submitted and is awaiting approval by an organization administrator.',
    };
  };

  const details = getStatusDetails();
  const Icon = details.icon;

  return (
    <div className="min-h-screen w-full bg-[#F5F7FB] dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-800 dark:text-slate-100">
      {/* Top Banner with Persona Switcher */}
      <div className="w-full max-w-xl mb-4 flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">RBAC Demo Mode:</span>
          <span>Switch persona to approve this request</span>
        </div>
        <PersonaSwitcher compact />
      </div>

      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {user?.organization?.name || 'Organization'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Handle: @{user?.organization?.handle || 'default'}
              </p>
            </div>
          </div>

          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${details.badgeColor}`}>
            {details.badge}
          </span>
        </div>

        <div className="py-8 text-center flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 text-slate-600 dark:text-slate-300">
            <Icon className="w-7 h-7" />
          </div>

          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {details.title}
          </h3>

          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
            {details.description}
          </p>

          <div className="mt-6 w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Applicant:</span>
              <span className="font-medium text-slate-900 dark:text-white">{user?.name} ({user?.email})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Requested Role:</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{user?.membership?.role || 'MEMBER'}</span>
            </div>
            {user?.membership?.note && (
              <div className="flex justify-between">
                <span className="text-slate-500">Applicant Note:</span>
                <span className="text-slate-700 dark:text-slate-300 italic">"{user.membership.note}"</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Submitted:</span>
              <span className="text-slate-700 dark:text-slate-300">
                {user?.membership?.requestedAt ? new Date(user.membership.requestedAt).toLocaleString() : 'Recent'}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            id="sign-out-status-screen-btn"
            onClick={logout}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>

          <button
            id="refresh-membership-status-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Check Approval Status</span>
          </button>
        </div>
      </div>
    </div>
  );
}
