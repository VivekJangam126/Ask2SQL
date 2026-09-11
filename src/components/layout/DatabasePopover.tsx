import React, { useRef, useEffect, useState } from 'react';
import { useData } from '../../context/DataContext.tsx';
import { Database, RefreshCw, CheckCircle2, AlertCircle, Table, ExternalLink } from 'lucide-react';

interface DatabasePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
}

export function DatabasePopover({ isOpen, onClose, onNavigate }: DatabasePopoverProps) {
  const { activeDataset, schema, isDbConnected, dbEngine, reconnectDb } = useData();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleReconnect = async () => {
    setIsReconnecting(true);
    await reconnectDb();
    setIsReconnecting(false);
  };

  return (
    <div
      ref={popoverRef}
      id="database-status-popover"
      className="absolute right-0 top-12 w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 p-4 text-slate-800 dark:text-slate-200"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="font-semibold text-sm">Active Database</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isDbConnected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3 h-3" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
              <AlertCircle className="w-3 h-3" />
              Disconnected
            </span>
          )}
        </div>
      </div>

      <div className="py-3 space-y-2.5 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Dataset Name</span>
          <span className="font-medium truncate max-w-[160px]">
            {activeDataset ? activeDataset.display_name : 'None selected'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Engine</span>
          <span className="font-medium font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {dbEngine}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Logical Schema</span>
          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
            {activeDataset ? activeDataset.internal_schema : '—'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500 dark:text-slate-400">Tables in Scope</span>
          <span className="font-medium flex items-center gap-1">
            <Table className="w-3 h-3 text-slate-400" />
            {schema ? `${schema.tables.length} table${schema.tables.length === 1 ? '' : 's'}` : '0'}
          </span>
        </div>

        {schema && (
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Schema Fingerprint</span>
            <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
              {schema.fingerprint}
            </span>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button
          id="reconnect-db-btn"
          onClick={handleReconnect}
          disabled={isReconnecting}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin text-indigo-600' : ''}`} />
          {isReconnecting ? 'Testing...' : 'Reconnect'}
        </button>

        <button
          id="explore-schema-btn"
          onClick={() => {
            onNavigate('schema');
            onClose();
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-medium transition-colors"
        >
          <span>Schema</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
