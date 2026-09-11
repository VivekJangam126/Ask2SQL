import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { useData } from '../../context/DataContext.tsx';
import { api } from '../../lib/api.ts';
import { AuditEvent } from '../../types/index.ts';
import {
  ShieldAlert,
  Users,
  Key,
  FileText,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  Lock,
  Unlock,
  ChevronRight,
  Database,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

export function AdminView() {
  const { user, refreshUser } = useAuth();
  const { datasets, refreshDatasets } = useData();

  const [activeTab, setActiveTab] = useState<'requests' | 'members' | 'permissions' | 'audit' | 'settings'>('requests');
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rejection modal
  const [rejectModalMembership, setRejectModalMembership] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Permissions editor state
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [currentPermissions, setCurrentPermissions] = useState<{
    canRead: boolean;
    canInsert: boolean;
    canUpdate: boolean;
    canDeleteRecords: boolean;
    canImportCsv: boolean;
    canExport: boolean;
  }>({
    canRead: true,
    canInsert: false,
    canUpdate: false,
    canDeleteRecords: false,
    canImportCsv: false,
    canExport: true,
  });

  // Audit filter state
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  // Org rename state
  const [newOrgName, setNewOrgName] = useState('');
  const [isUpdatingOrg, setIsUpdatingOrg] = useState(false);

  const orgId = user?.organization?.id;

  const loadOrgData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const [details, auditRes] = await Promise.all([
        api.admin.getOrganizationDetails(orgId),
        api.admin.getAuditLogs(orgId, {
          action: auditActionFilter,
          search: auditSearch,
          limit: 100,
        }),
      ]);
      setOrgDetails(details);
      setAuditLogs(auditRes.auditLogs || []);
      setNewOrgName(details.organization?.name || '');

      // Pre-select first non-admin member and dataset for permissions tab
      const firstMember = details.members?.find((m: any) => m.role === 'MEMBER');
      if (firstMember && !selectedMemberId) {
        setSelectedMemberId(firstMember.id);
      }
      if (datasets.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(datasets[0].id);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load organization data' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrgData();
  }, [orgId, auditActionFilter]);

  // Update permissions state when member or dataset changes
  useEffect(() => {
    if (!orgDetails || !selectedMemberId || !selectedDatasetId) return;
    const member = orgDetails.members?.find((m: any) => m.id === selectedMemberId);
    const grant = member?.permissions?.find((p: any) => p.databaseId === selectedDatasetId);

    if (grant) {
      setCurrentPermissions({
        canRead: grant.canRead,
        canInsert: grant.canInsert,
        canUpdate: grant.canUpdate,
        canDeleteRecords: grant.canDeleteRecords,
        canImportCsv: grant.canImportCsv,
        canExport: grant.canExport,
      });
    } else {
      setCurrentPermissions({
        canRead: false,
        canInsert: false,
        canUpdate: false,
        canDeleteRecords: false,
        canImportCsv: false,
        canExport: false,
      });
    }
  }, [selectedMemberId, selectedDatasetId, orgDetails]);

  // Handle member status change (approve, suspend, reactivate, remove)
  const handleStatusChange = async (membershipId: string, status: string, reason?: string) => {
    setFeedback(null);
    try {
      await api.admin.updateMemberStatus(membershipId, status, reason);
      setFeedback({ type: 'success', message: `Member status updated to ${status}.` });
      setRejectModalMembership(null);
      setRejectionReason('');
      await loadOrgData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update member status' });
    }
  };

  // Save permissions
  const handleSavePermissions = async () => {
    if (!selectedMemberId || !selectedDatasetId) return;
    setFeedback(null);
    try {
      await api.admin.updateMemberPermissions(selectedMemberId, selectedDatasetId, currentPermissions);
      setFeedback({ type: 'success', message: 'Database permissions updated successfully.' });
      await loadOrgData();
      await refreshDatasets();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update permissions' });
    }
  };

  // Handle Org update
  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsUpdatingOrg(true);
    setFeedback(null);
    try {
      await api.admin.updateOrganization(orgId!, { name: newOrgName.trim() });
      setFeedback({ type: 'success', message: 'Organization name updated.' });
      await refreshUser();
      await loadOrgData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update organization' });
    } finally {
      setIsUpdatingOrg(false);
    }
  };

  const pendingRequests = orgDetails?.members?.filter((m: any) => m.status === 'PENDING') || [];
  const activeMembers = orgDetails?.members?.filter((m: any) => m.status !== 'PENDING') || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              <span>Organization Administration</span>
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Org Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage member access requests, grant granular database permissions, and inspect immutable audit trails
          </p>
        </div>

        <button
          id="refresh-admin-data-btn"
          onClick={loadOrgData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-purple-600' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Organization Overview Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Organization</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate">
            {orgDetails?.organization?.name || user?.organization?.name || 'Loading...'}
          </p>
          <p className="text-[11px] text-slate-400">@{orgDetails?.organization?.handle}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Pending Requests</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {pendingRequests.length}
          </p>
          <p className="text-[11px] text-slate-400">Awaiting review</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Members</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {activeMembers.length}
          </p>
          <p className="text-[11px] text-slate-400">Active in tenant</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Databases</span>
            <Database className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {datasets.length}
          </p>
          <p className="text-[11px] text-slate-400">Protected by RBAC</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto">
        <button
          id="admin-tab-requests"
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'requests'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Access Requests</span>
          {pendingRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          id="admin-tab-members"
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'members'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Members & Roles</span>
        </button>

        <button
          id="admin-tab-permissions"
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'permissions'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Database Permissions Matrix</span>
        </button>

        <button
          id="admin-tab-audit"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Trail</span>
        </button>

        <button
          id="admin-tab-settings"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Organization Settings</span>
        </button>
      </div>

      {/* Tab 1: Access Requests */}
      {activeTab === 'requests' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pending Member Access Requests
              </h3>
              <p className="text-xs text-slate-500">
                Approve or reject requests from users seeking access to {orgDetails?.organization?.name}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {pendingRequests.length} pending
            </span>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-80" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">All caught up!</p>
              <p className="text-xs mt-1">No pending member access requests at this time.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingRequests.map((req: any) => (
                <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {req.userName}
                      </span>
                      <span className="text-xs text-slate-500">({req.userEmail})</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {req.role}
                      </span>
                    </div>

                    {req.note && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                        "{req.note}"
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Submitted: {new Date(req.requestedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id={`reject-request-${req.id}-btn`}
                      onClick={() => setRejectModalMembership(req)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-medium transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    <button
                      id={`approve-request-${req.id}-btn`}
                      onClick={() => handleStatusChange(req.id, 'APPROVED')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Access</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Members & Roles */}
      {activeTab === 'members' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Organization Members Directory
              </h3>
              <p className="text-xs text-slate-500">
                Manage roles, suspend accounts, and configure active user state
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {activeMembers.length} members
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-750 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Membership Status</th>
                  <th className="px-4 py-3 font-semibold">Joined / Approved</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {activeMembers.map((m: any) => {
                  const isCurrent = m.userId === user?.id;
                  const isSuspended = m.status === 'SUSPENDED';

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {m.userName} {isCurrent && <span className="text-[10px] text-purple-600 font-normal">(You)</span>}
                        </div>
                        <div className="text-[11px] text-slate-400">{m.userEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          m.role === 'ORG_ADMIN'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          m.status === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : m.status === 'SUSPENDED'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {m.status}
                        </span>
                        {m.rejectionReason && (
                          <p className="text-[10px] text-slate-400 italic mt-0.5">"{m.rejectionReason}"</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-[11px]">
                        {m.approvedAt ? new Date(m.approvedAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isCurrent && (
                          <div className="flex items-center justify-end gap-1.5">
                            {isSuspended ? (
                              <button
                                id={`reactivate-member-${m.id}-btn`}
                                onClick={() => handleStatusChange(m.id, 'APPROVED')}
                                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 text-[11px] font-medium transition-colors"
                              >
                                Reactivate
                              </button>
                            ) : (
                              <button
                                id={`suspend-member-${m.id}-btn`}
                                onClick={() => handleStatusChange(m.id, 'SUSPENDED')}
                                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 text-slate-700 hover:text-rose-700 text-[11px] font-medium transition-colors"
                              >
                                Suspend
                              </button>
                            )}

                            <button
                              id={`remove-member-${m.id}-btn`}
                              onClick={() => {
                                if (confirm(`Remove ${m.userName} from this organization?`)) {
                                  handleStatusChange(m.id, 'REJECTED', 'Removed by administrator');
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Database Permissions Matrix */}
      {activeTab === 'permissions' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Granular Database Access Control (RBAC)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Select a member and a database to grant or revoke specific operation privileges (Read, Insert, Update, Delete Records, Append CSV, Export CSV).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Select Member */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Select Member
              </label>
              <select
                id="rbac-member-select"
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {activeMembers.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.userName} ({m.userEmail}) - {m.role}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Database */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Select Database
              </label>
              <select
                id="rbac-database-select"
                value={selectedDatasetId}
                onChange={e => setSelectedDatasetId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.display_name} ({d.table_count || 1} table)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Permissions Toggles */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-750 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Privileges for selected pair
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {/* Can Read */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-read"
                  checked={currentPermissions.canRead}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canRead: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Read Data</span>
                  <span className="text-[11px] text-slate-500">View records & run AI queries</span>
                </div>
              </label>

              {/* Can Insert */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-insert"
                  checked={currentPermissions.canInsert}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canInsert: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Insert Records</span>
                  <span className="text-[11px] text-slate-500">Add new rows to tables</span>
                </div>
              </label>

              {/* Can Update */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-update"
                  checked={currentPermissions.canUpdate}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canUpdate: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Update Records</span>
                  <span className="text-[11px] text-slate-500">Edit existing row fields</span>
                </div>
              </label>

              {/* Can Delete Records */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-delete-records"
                  checked={currentPermissions.canDeleteRecords}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canDeleteRecords: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Delete Records</span>
                  <span className="text-[11px] text-slate-500">Remove specific table rows</span>
                </div>
              </label>

              {/* Can Import CSV */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-import-csv"
                  checked={currentPermissions.canImportCsv}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canImportCsv: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Append CSV Data</span>
                  <span className="text-[11px] text-slate-500">Batch append into tables</span>
                </div>
              </label>

              {/* Can Export CSV */}
              <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 cursor-pointer hover:border-purple-400 transition-colors">
                <input
                  type="checkbox"
                  id="perm-can-export"
                  checked={currentPermissions.canExport}
                  onChange={e => setCurrentPermissions({ ...currentPermissions, canExport: e.target.checked })}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="font-semibold block text-slate-900 dark:text-white">Export to CSV</span>
                  <span className="text-[11px] text-slate-500">Download sanitized table CSV</span>
                </div>
              </label>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                id="save-rbac-permissions-btn"
                onClick={handleSavePermissions}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Save Permissions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Immutable Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Immutable Security & Mutation Audit Trail</span>
              </h3>
              <p className="text-xs text-slate-500">
                Tamper-evident log of all access events, schema alterations, and record mutations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="audit-filter-action"
                value={auditActionFilter}
                onChange={e => setAuditActionFilter(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="">All Actions</option>
                <option value="DATABASE_CREATED">DATABASE_CREATED</option>
                <option value="DATABASE_DELETED">DATABASE_DELETED</option>
                <option value="TABLE_CREATED">TABLE_CREATED</option>
                <option value="TABLE_DROPPED">TABLE_DROPPED</option>
                <option value="RECORD_INSERTED">RECORD_INSERTED</option>
                <option value="RECORD_UPDATED">RECORD_UPDATED</option>
                <option value="RECORD_DELETED">RECORD_DELETED</option>
                <option value="CSV_APPENDED">CSV_APPENDED</option>
                <option value="TABLE_EXPORTED">TABLE_EXPORTED</option>
                <option value="MEMBER_APPROVED">MEMBER_APPROVED</option>
                <option value="PERMISSIONS_UPDATED">PERMISSIONS_UPDATED</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-750 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Timestamp</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Actor</th>
                  <th className="px-4 py-2.5 font-semibold">Target</th>
                  <th className="px-4 py-2.5 font-semibold">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No audit events matching criteria.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          log.action.includes('DELETED') || log.action.includes('DROPPED') || log.action.includes('REJECTED')
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            : log.action.includes('INSERTED') || log.action.includes('CREATED') || log.action.includes('APPROVED')
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium text-slate-900 dark:text-white">
                          {log.actor_name || 'System'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">{log.actor_email}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px] max-w-[140px] truncate">
                        {log.target_name || log.target_id || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 text-xs">
                        {log.summary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Organization Settings */}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Organization Details & Tenant Configuration
            </h3>
            <p className="text-xs text-slate-500">
              Manage tenant branding and profile information
            </p>
          </div>

          <form onSubmit={handleUpdateOrg} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Organization Display Name
              </label>
              <input
                type="text"
                id="org-name-input"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Tenant Handle (Immutable)
              </label>
              <input
                type="text"
                disabled
                value={`@${orgDetails?.organization?.handle || ''}`}
                className="w-full bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Tenant ID
              </label>
              <input
                type="text"
                disabled
                value={orgId || ''}
                className="w-full bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              id="update-org-name-btn"
              disabled={isUpdatingOrg}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <span>{isUpdatingOrg ? 'Saving...' : 'Save Organization Name'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Reject Request Modal */}
      {rejectModalMembership && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 text-rose-600">
              <XCircle className="w-5 h-5" />
              <span>Decline Access Request</span>
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              You are declining access for <strong className="text-slate-900 dark:text-white">{rejectModalMembership.userName}</strong> ({rejectModalMembership.userEmail}). You may optionally provide a reason.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Rejection (Optional)
              </label>
              <textarea
                id="reject-reason-textarea"
                rows={3}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="e.g. Unverified corporate email, or access should be requested via Department Lead."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalMembership(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="button"
                id="confirm-reject-btn"
                onClick={() => handleStatusChange(rejectModalMembership.id, 'REJECTED', rejectionReason)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Decline Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
