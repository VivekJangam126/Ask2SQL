import React from 'react';
import { useData } from '../../context/DataContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Sparkles,
  Database,
  Layers,
  History,
  Settings,
  Plus,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenImport: () => void;
}

export function Sidebar({ currentView, onNavigate, onOpenImport }: SidebarProps) {
  const { user } = useAuth();
  const { datasets, activeDataset, setActiveDataset } = useData();

  const isAdmin = user?.membership?.role === 'ORG_ADMIN';

  const navItems = [
    { id: 'analyst', label: 'AI Analyst', icon: Sparkles },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'schema', label: 'Schema Explorer', icon: Layers },
    { id: 'history', label: 'Query History', icon: History },
    ...(isAdmin ? [{ id: 'admin', label: 'Administration', icon: ShieldAlert }] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-[232px] bg-[#101828] text-slate-300 flex flex-col shrink-0 select-none h-screen border-r border-slate-800"
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800/80">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
          <Database className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white tracking-tight text-base">ClaritySQL</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              v1.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Transparent AI Analyst</p>
        </div>
      </div>

      {/* Dataset Selector / Current Scope */}
      <div className="px-4 py-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Active Dataset
          </span>
          <button
            id="quick-import-csv-btn"
            onClick={onOpenImport}
            title="Import new CSV"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {datasets.length === 0 ? (
          <button
            id="empty-dataset-import-btn"
            onClick={onOpenImport}
            className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-dashed border-slate-700 text-xs text-indigo-300 hover:text-white flex items-center gap-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create dataset from CSV</span>
          </button>
        ) : (
          <div className="relative">
            <select
              id="active-dataset-select"
              value={activeDataset?.id || ''}
              onChange={e => {
                const found = datasets.find(d => d.id === e.target.value);
                if (found) setActiveDataset(found);
              }}
              className="w-full appearance-none bg-slate-800/90 text-white text-xs rounded-lg px-2.5 py-2 pr-7 border border-slate-700 focus:outline-none focus:border-indigo-500 font-medium truncate cursor-pointer"
            >
              {datasets.map(d => (
                <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                  {d.display_name} ({d.table_count || 1} tbl)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Primary Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}-btn`}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Security Badge */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-slate-200">Read-Only Guard</p>
            <p className="text-[11px] text-slate-400">AST verification & zero DDL</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
