import React, { useState } from 'react';
import {
  ShieldCheck,
  Play,
  Code,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Database,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { QueryPreview, QuestionInterpretation, ValidationReport } from '../../types/index.ts';
import { SqlViewerModal } from './SqlViewerModal.tsx';
import { SqlCorrectionDrawer } from './SqlCorrectionDrawer.tsx';

interface QueryReviewCardProps {
  question: string;
  interpretation?: QuestionInterpretation;
  preview: QueryPreview;
  datasetName: string;
  onConfirm: () => Promise<void>;
  onEditQuestion: () => void;
  isExecuting: boolean;
}

export function QueryReviewCard({
  question,
  interpretation,
  preview,
  datasetName,
  onConfirm,
  onEditQuestion,
  isExecuting,
}: QueryReviewCardProps) {
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isCorrectionDrawerOpen, setIsCorrectionDrawerOpen] = useState(false);

  const report = preview.validationReport;
  const hasCorrections = preview.attempts && preview.attempts.length > 1;

  return (
    <div
      id="query-review-card"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
    >
      {/* Notice Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-900/40 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-semibold">Ready for your review. This query has not run.</span>
        </div>
        <span className="text-[11px] text-amber-700/80 dark:text-amber-400 font-mono">
          TTL: 15 mins
        </span>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {/* Section 1: Question & Plain Language Interpretation */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Natural Language Intent
            </h3>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Original Question
              </span>
              <p className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                "{question}"
              </p>
            </div>

            {interpretation && (
              <div className="pt-2.5 border-t border-slate-200 dark:border-slate-700/60">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Structured Interpretation
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 leading-relaxed">
                  {interpretation.summary}
                </p>

                {/* Badges for group by / measures / sort */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {interpretation.aggregation && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Aggregation: {interpretation.aggregation}
                    </span>
                  )}
                  {interpretation.measure && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Measure: {interpretation.measure}
                    </span>
                  )}
                  {interpretation.groupBy && interpretation.groupBy.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Group By: {interpretation.groupBy.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Exact Generated SQL & Transparency Controls */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Exact PostgreSQL Query (Approved Candidate)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {hasCorrections && (
                <button
                  id="view-sql-corrections-btn"
                  onClick={() => setIsCorrectionDrawerOpen(true)}
                  className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Corrected ({preview.attempts?.length} drafts)</span>
                </button>
              )}
              <button
                id="expand-sql-modal-btn"
                onClick={() => setIsSqlModalOpen(true)}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
              >
                <span>Inspect full SQL</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="relative group">
            <pre className="p-4 rounded-xl bg-slate-950 text-indigo-200 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap border border-slate-800 max-h-48">
              {preview.sql}
            </pre>
          </div>
        </div>

        {/* Section 3: AST Validation Report */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Server-Side AST Security Verifications
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Syntax & Structure</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {report.checks.syntax.message}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Read-Only Enforced</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Zero INSERT/UPDATE/DELETE/DDL; SELECT only.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Schema Objects</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Tables restricted strictly to "{datasetName}".
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Result Limits</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Bounded to {preview.resultLimit} rows max.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Target Database Context & Confirmation Action */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 w-full sm:w-auto">
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Target: <strong className="text-slate-700 dark:text-slate-200">{datasetName}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              id="edit-question-btn"
              onClick={onEditQuestion}
              disabled={isExecuting}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
            >
              Edit question
            </button>

            <button
              id="confirm-run-query-btn"
              onClick={onConfirm}
              disabled={isExecuting}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-60"
            >
              {isExecuting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Executing on PostgreSQL...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Confirm & run query</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SqlViewerModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
        sql={preview.sql}
        params={preview.params}
        digest={preview.digest}
        validationReport={preview.validationReport}
      />

      {preview.attempts && (
        <SqlCorrectionDrawer
          isOpen={isCorrectionDrawerOpen}
          onClose={() => setIsCorrectionDrawerOpen(false)}
          attempts={preview.attempts}
        />
      )}
    </div>
  );
}
