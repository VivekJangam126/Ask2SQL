import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  HelpCircle,
  AlertCircle,
  Database,
  Lightbulb,
} from 'lucide-react';
import { useData } from '../../context/DataContext.tsx';

interface QuestionInputProps {
  onSubmit: (question: string) => Promise<void>;
  isLoading: boolean;
  loadingStep?: string;
  error?: string | null;
  clarificationQuestion?: string | null;
}

export function QuestionInput({
  onSubmit,
  isLoading,
  loadingStep = 'Analyzing question...',
  error,
  clarificationQuestion,
}: QuestionInputProps) {
  const { activeDataset, schema } = useData();
  const [question, setQuestion] = useState('');

  // Generate suggested questions based on tables in schema
  const suggestions = React.useMemo(() => {
    if (!schema || schema.tables.length === 0) {
      return [
        'How many total records are there?',
        'List all entries ordered by recent dates',
      ];
    }

    const tableNames = schema.tables.map(t => t.name.toLowerCase());

    if (tableNames.includes('marks') || tableNames.includes('students')) {
      return [
        'Compare average marks across departments',
        'Count total students in each department',
        'Which students scored above 85 in semester 4?',
        'List the top 5 highest average marks by department',
      ];
    }

    // Generic schema-aware suggestions
    const firstTable = schema.tables[0];
    const numCol = firstTable.columns.find(c =>
      c.dataType.includes('int') || c.dataType.includes('numeric') || c.dataType.includes('float')
    );
    const textCol = firstTable.columns.find(c =>
      c.dataType.includes('char') || c.dataType.includes('text')
    );

    const list = [`Count total records in ${firstTable.name}`];
    if (textCol && numCol) {
      list.push(`Average ${numCol.name} grouped by ${textCol.name}`);
    }
    if (textCol) {
      list.push(`Distribution of entries by ${textCol.name}`);
    }
    return list;
  }, [schema]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!question.trim() || isLoading) return;
    onSubmit(question.trim());
  };

  return (
    <div
      id="question-input-card"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Ask a question about your data</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Querying active scope:{' '}
            <strong className="text-slate-700 dark:text-slate-300">
              {activeDataset ? activeDataset.display_name : 'No dataset selected'}
            </strong>
          </p>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            id="question-input-textarea"
            rows={3}
            placeholder="e.g. Compare average marks across departments, or show top 5 students by score..."
            value={question}
            onChange={e => setQuestion(e.target.value)}
            disabled={isLoading}
            className="w-full text-sm p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 resize-none transition-all disabled:opacity-60"
          />

          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <button
              id="submit-question-btn"
              type="submit"
              disabled={!question.trim() || isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm shadow-indigo-600/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{loadingStep}</span>
                </>
              ) : (
                <>
                  <span>Prepare Review</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Clarification Alert */}
      {clarificationQuestion && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Clarification required:</p>
            <p className="leading-relaxed">{clarificationQuestion}</p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
              Please refine your question above with more specifics.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to formulate valid read-only query</p>
            <p className="leading-relaxed mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Suggested Prompts */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
          <span>Suggested analytical inquiries:</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              id={`suggested-question-${idx}`}
              onClick={() => {
                setQuestion(s);
              }}
              disabled={isLoading}
              className="text-left px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 transition-colors"
            >
              "{s}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
