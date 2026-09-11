import React, { useState } from 'react';
import { X, Copy, Check, Code, ShieldCheck } from 'lucide-react';
import { ValidationReport } from '../../types/index.ts';

interface SqlViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: string;
  params?: any[];
  digest?: string;
  validationReport?: ValidationReport;
}

export function SqlViewerModal({
  isOpen,
  onClose,
  sql,
  params = [],
  digest,
  validationReport,
}: SqlViewerModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="sql-viewer-modal"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Code className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                Validated PostgreSQL Statement
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Server-owned, AST-checked analytical query
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="copy-sql-modal-btn"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy SQL'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* SQL Block */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                SQL Query
              </span>
              {digest && (
                <span className="text-[11px] font-mono text-slate-400">
                  Digest: {digest.substring(0, 16)}...
                </span>
              )}
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 text-indigo-300 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap border border-slate-800">
              {sql}
            </pre>
          </div>

          {/* Bound Parameters */}
          {params && params.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1.5">
                Bound Parameters
              </span>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-xs">
                {params.map((param, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-400">${i + 1}:</span>
                    <span className="text-slate-800 dark:text-slate-200">{JSON.stringify(param)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Status */}
          {validationReport && (
            <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-medium text-xs mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>AST Security Verifications Passed</span>
              </div>
              <ul className="text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
                <li>• {validationReport.checks.readOnly.message}</li>
                <li>• {validationReport.checks.objects.message}</li>
                <li>• {validationReport.checks.functions.message}</li>
                <li>• {validationReport.checks.limits.message}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
