import React, { useState } from 'react';
import {
  ExecutionResult,
  QueryPreview,
  GroundedInsight,
} from '../../types/index.ts';
import { ChartCard } from './ChartCard.tsx';
import { TableCard } from './TableCard.tsx';
import { GroundedInsightCard } from './GroundedInsightCard.tsx';
import { SqlViewerModal } from './SqlViewerModal.tsx';
import {
  Clock,
  Table as TableIcon,
  HardDrive,
  Code,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface ResultViewProps {
  question: string;
  result: ExecutionResult;
  preview?: QueryPreview | null;
  onNewQuestion: () => void;
}

export function ResultView({ question, result, preview, onNewQuestion }: ResultViewProps) {
  const [currentInsight, setCurrentInsight] = useState<GroundedInsight | undefined>(result.insight);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);

  return (
    <div id="execution-result-view" className="space-y-6">
      {/* Execution Performance & Metric Strip */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Query Executed Successfully
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {result.durationMs}ms
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              "{question}"
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
            {/* Rows badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
              <TableIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400">Rows:</span>
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {result.totalRows}
              </strong>
            </div>

            {/* Payload size */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400">Size:</span>
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {(result.sizeBytes / 1024).toFixed(1)} KB
              </strong>
            </div>

            {/* Inspect SQL button */}
            {preview && (
              <button
                id="inspect-executed-sql-btn"
                onClick={() => setIsSqlModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              >
                <Code className="w-3.5 h-3.5 text-indigo-600" />
                <span>View SQL</span>
              </button>
            )}

            {/* New Inquiry button */}
            <button
              id="new-inquiry-btn"
              onClick={onNewQuestion}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ask New Question</span>
            </button>
          </div>
        </div>

        {result.isCapped && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              Result set hit the server safety ceiling of 1,000 rows. Narrow your question or add specific grouping filters to inspect a more focused subset.
            </span>
          </div>
        )}
      </div>

      {/* Grounded AI Insights */}
      {currentInsight && (
        <GroundedInsightCard
          executionId={result.id}
          insight={currentInsight}
          onInsightUpdated={setCurrentInsight}
        />
      )}

      {/* Chart Visualization (if applicable) */}
      <ChartCard
        columns={result.columns}
        rows={result.rows}
        insight={currentInsight}
      />

      {/* Interactive Data Table */}
      <TableCard
        executionId={result.id}
        columns={result.columns}
        rows={result.rows}
        totalRows={result.totalRows}
        isCapped={result.isCapped}
      />

      {/* SQL Inspection Modal */}
      {preview && (
        <SqlViewerModal
          isOpen={isSqlModalOpen}
          onClose={() => setIsSqlModalOpen(false)}
          sql={preview.sql}
          params={preview.params}
          digest={preview.digest}
          validationReport={preview.validationReport}
        />
      )}
    </div>
  );
}
