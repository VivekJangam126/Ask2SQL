import React from 'react';
import { X, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { SqlAttempt } from '../../types/index.ts';

interface SqlCorrectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  attempts: SqlAttempt[];
}

export function SqlCorrectionDrawer({ isOpen, onClose, attempts }: SqlCorrectionDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      id="sql-correction-drawer"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">
              SQL Correction Transparency
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            ClaritySQL uses bounded AST correction (up to 3 iterations). Each draft is tested against our PostgreSQL AST validator before being presented for review.
          </div>

          <div className="space-y-6">
            {attempts.map((att, idx) => {
              const isLast = idx === attempts.length - 1;
              const isSuccess = att.report?.isValid;

              return (
                <div
                  key={att.attemptNumber}
                  className={`p-4 rounded-xl border ${
                    isSuccess
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10'
                      : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                      {isSuccess ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      Attempt #{att.attemptNumber} {isLast && isSuccess ? '(Accepted Final)' : ''}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        isSuccess
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {isSuccess ? 'Passed Validation' : 'Needs Correction'}
                    </span>
                  </div>

                  {att.correctionReason && (
                    <div className="mb-2.5 p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-[11px] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                      <strong>Reason:</strong> {att.correctionReason}
                    </div>
                  )}

                  <pre className="p-3 rounded-lg bg-slate-950 text-indigo-300 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap border border-slate-800 mb-2">
                    {att.sql}
                  </pre>

                  {att.report?.errors && att.report.errors.length > 0 && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 space-y-0.5">
                      <strong>Validation issues:</strong>
                      {att.report.errors.map((e, i) => (
                        <p key={i}>• {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
