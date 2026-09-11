import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Users,
  Shield,
  UserCheck,
  Eye,
  Clock,
  Ban,
  UserX,
  Building2,
  ChevronDown,
  Check,
} from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  email: string;
  org: string;
  role: string;
  status: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'acme-admin',
    name: 'Sarah Chen (Admin)',
    email: 'admin@claritysql.internal',
    org: 'Acme Analytics',
    role: 'ORG_ADMIN',
    status: 'APPROVED',
    description: 'Full administrative access, member approval, schema changes, audit log',
    icon: Shield,
    badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  {
    id: 'acme-editor',
    name: 'Alex Rivera (Editor)',
    email: 'member.editor@claritysql.internal',
    org: 'Acme Analytics',
    role: 'MEMBER',
    status: 'APPROVED',
    description: 'Can read, insert, update, and delete records and append CSVs',
    icon: UserCheck,
    badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  {
    id: 'acme-readonly',
    name: 'David Kim (Read-Only)',
    email: 'member.readonly@claritysql.internal',
    org: 'Acme Analytics',
    role: 'MEMBER',
    status: 'APPROVED',
    description: 'Read-only queries & export. Cannot insert, update, or delete records',
    icon: Eye,
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  {
    id: 'acme-pending',
    name: 'Morgan Blake (Pending)',
    email: 'member.pending@claritysql.internal',
    org: 'Acme Analytics',
    role: 'MEMBER',
    status: 'PENDING',
    description: 'Requested access, awaiting approval from Acme Admin',
    icon: Clock,
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  {
    id: 'acme-rejected',
    name: 'Taylor Swift (Rejected)',
    email: 'member.rejected@claritysql.internal',
    org: 'Acme Analytics',
    role: 'MEMBER',
    status: 'REJECTED',
    description: 'Membership request was rejected with reason',
    icon: Ban,
    badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
  {
    id: 'acme-suspended',
    name: 'Jordan Lee (Suspended)',
    email: 'member.suspended@claritysql.internal',
    org: 'Acme Analytics',
    role: 'MEMBER',
    status: 'SUSPENDED',
    description: 'Temporarily suspended member account',
    icon: UserX,
    badgeColor: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  },
  {
    id: 'nexus-admin',
    name: 'Marcus Vance (Nexus Tech)',
    email: 'admin.nexus@claritysql.internal',
    org: 'Nexus Tech',
    role: 'ORG_ADMIN',
    status: 'APPROVED',
    description: 'Separate isolated tenant (Tenant 2). Cannot see Acme data',
    icon: Building2,
    badgeColor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
];

export function PersonaSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, loginDemo } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentPersona = PERSONAS.find(p => p.email.toLowerCase() === user?.email.toLowerCase());

  const handleSelect = async (p: Persona) => {
    if (p.email.toLowerCase() === user?.email.toLowerCase()) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await loginDemo(p.email);
      setIsOpen(false);
      // Reload page to refresh all active queries and tenant datasets
      window.location.reload();
    } catch (err: any) {
      alert(`Switch failed: ${err.message}`);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="relative inline-block text-left select-none">
      <button
        id="persona-switcher-trigger-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className={`flex items-center gap-2 rounded-lg border transition-colors ${
          compact
            ? 'px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            : 'px-3 py-1.5 text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 shadow-sm'
        } hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50`}
        title="Switch persona to test RBAC and multi-tenancy"
      >
        <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="truncate max-w-[130px] sm:max-w-[170px]">
          {isSwitching
            ? 'Switching...'
            : currentPersona
            ? currentPersona.name
            : user?.name || 'Switch Role'}
        </span>
        <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 text-slate-800 dark:text-slate-100 max-h-[80vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Multi-Tenant & RBAC Personas
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Switch identity instantly to evaluate permission boundaries and tenant isolation.
              </p>
            </div>

            <div className="py-1 space-y-1">
              {PERSONAS.map(p => {
                const Icon = p.icon;
                const isCurrent = p.email.toLowerCase() === user?.email.toLowerCase();

                return (
                  <button
                    key={p.id}
                    id={`switch-to-${p.id}-btn`}
                    onClick={() => handleSelect(p)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs flex items-start gap-3 transition-colors ${
                      isCurrent
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="mt-0.5 p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 shrink-0">
                      <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {p.name}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${p.badgeColor}`}>
                          {p.role === 'ORG_ADMIN' ? 'Admin' : 'Member'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{p.org}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">{p.status}</span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">
                        {p.description}
                      </p>
                    </div>

                    {isCurrent && (
                      <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
