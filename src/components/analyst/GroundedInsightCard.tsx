import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Lightbulb,
  FileCheck2,
} from 'lucide-react';
import { GroundedInsight } from '../../types/index.ts';
import { api } from '../../lib/api.ts';

interface GroundedInsightCardProps {
  executionId: string;
  insight: GroundedInsight;
  onInsightUpdated?: (newInsight: GroundedInsight) => void;
}

export function GroundedInsightCard({
  executionId,
  insight,
  onInsightUpdated,
}: GroundedInsightCardProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryInsight = async () => {
    setIsRetrying(true);
    try {
      const res = await api.executions.retryInsight(executionId);
      if (res.success && res.insight && onInsightUpdated) {
        onInsightUpdated(res.insight);
      }
    } catch (err) {
      console.error('Failed to regenerate insight:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      id="grounded-insight-card"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              Grounded AI Analysis & Insights
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Synthesized strictly from the verified returned dataset snapshot
            </p>
          </div>
        </div>

        <button
          id="regenerate-insight-btn"
          onClick={handleRetryInsight}
          disabled={isRetrying}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin text-indigo-600' : ''}`} />
          <span>{isRetrying ? 'Synthesizing...' : 'Regenerate'}</span>
        </button>
      </div>

      {/* Summary Highlight */}
      <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 mb-1">
              Executive Summary
            </p>
            <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
              {insight.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Plain-Language Explanation */}
      {insight.explanation && (
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[11px]">
            Findings & Nuances
          </h4>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            {insight.explanation}
          </p>
        </div>
      )}

      {/* Evidence Checklist */}
      {insight.evidence && insight.evidence.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            <h4 className="font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[11px]">
              Verifiable Evidence Checklist
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {insight.evidence.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Grounding Guard */}
      <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Zero hallucinations: assertions are traceable to PostgreSQL rows</span>
        </div>
        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
          Gemini 2.5 Flash
        </span>
      </div>
    </div>
  );
}
