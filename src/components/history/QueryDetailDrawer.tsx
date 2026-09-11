import React, { useState } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Code,
  Table as TableIcon,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { HistoryItem } from '../../types/index.ts';

interface QueryDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: HistoryItem | null;
}

export function QueryDetailDrawer({ isOpen, onClose, item }: QueryDetailDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !item) return null;

  const handleCopy = () => {
    if (item.sql_text) {
      navigator.clipboard.writeText(item.sql_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isSuccess = item.execution_status === 'completed' || item.status === 'executed';

  return (
    <div
      id="query-detail-drawer"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              Query Execution Details
            </h3>
            <span className="text-xs text-slate-400">
              Executed on {new Date(item.created_at).toLocaleString()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* Question & Summary */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Natural Language Question
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              "{item.question}"
            </p>
            {item.summary && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {item.summary}
              </p>
            )}
          </div>

          {/* Execution Metrics Strip */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Status</span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1">
                {isSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Completed</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    <span>{item.execution_status || item.status}</span>
                  </>
                )}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Duration</span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-1">
                {item.duration_ms ? `${item.duration_ms}ms` : '—'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Rows Returned</span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono mt-1">
                {item.total_rows !== undefined ? item.total_rows : '—'}
              </p>
            </div>
          </div>

          {/* Executed SQL */}
          {item.sql_text && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Executed PostgreSQL Query
                </span>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <pre className="p-3.5 rounded-xl bg-slate-950 text-indigo-300 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap border border-slate-800 max-h-56">
                {item.sql_text}
              </pre>
            </div>
          )}

          {/* Digest */}
          {item.digest && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                Query Cryptographic Digest (SHA-256)
              </span>
              <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                {item.digest}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
