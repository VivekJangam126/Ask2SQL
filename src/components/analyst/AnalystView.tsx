import React, { useState } from 'react';
import { useData } from '../../context/DataContext.tsx';
import { QuestionInput } from './QuestionInput.tsx';
import { QueryReviewCard } from './QueryReviewCard.tsx';
import { ResultView } from './ResultView.tsx';
import { api } from '../../lib/api.ts';
import {
  AnalysisRecord,
  QueryPreview,
  ExecutionResult,
  QuestionInterpretation,
} from '../../types/index.ts';
import { Sparkles, Database, Plus, CheckCircle2, AlertCircle } from 'lucide-react';

interface AnalystViewProps {
  onOpenImport: () => void;
}

export function AnalystView({ onOpenImport }: AnalystViewProps) {
  const { datasets, activeDataset, refreshDatasets, refreshSchema } = useData();

  const [question, setQuestion] = useState('');
  const [stage, setStage] = useState<'input' | 'review' | 'result'>('input');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('Analyzing question...');
  const [error, setError] = useState<string | null>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);

  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisRecord | null>(null);
  const [currentPreview, setCurrentPreview] = useState<QueryPreview | null>(null);
  const [currentResult, setCurrentResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Handle seeding sample college data if user has no datasets yet
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedSample = async () => {
    setIsSeeding(true);
    setError(null);
    try {
      await api.datasets.seedSample();
      await refreshDatasets();
    } catch (err: any) {
      setError(err.message || 'Failed to seed sample dataset');
    } finally {
      setIsSeeding(false);
    }
  };

  // Step 1: User submits question
  const handleQuestionSubmit = async (q: string) => {
    if (!activeDataset) {
      setError('Please select or create a dataset before asking questions.');
      return;
    }

    setQuestion(q);
    setIsLoading(true);
    setError(null);
    setClarificationQuestion(null);
    setLoadingStep('Understanding question intent...');

    try {
      // 1. Create analysis
      const analysisInit = await api.analyses.create(activeDataset.id, q);
      setLoadingStep('Drafting and AST-validating SQL statement...');

      // 2. Prepare analysis (runs Gemini + validator)
      const prep = await api.analyses.prepare(analysisInit.analysisId);

      if (prep.status === 'needs_clarification') {
        setClarificationQuestion(prep.clarificationQuestion || 'Could you please clarify your question?');
        setIsLoading(false);
        return;
      }

      if (prep.status === 'unsupported' || prep.status === 'failed') {
        setError(prep.error || 'The requested analysis cannot be safely translated to a read-only query.');
        setIsLoading(false);
        return;
      }

      // Fetch prepared analysis record with preview
      const fullRecord = await api.analyses.get(analysisInit.analysisId);
      setCurrentAnalysis(fullRecord);
      setCurrentPreview(fullRecord.preview || null);
      setStage('review');
    } catch (err: any) {
      console.error('Analysis formulation error:', err);
      setError(err.message || 'Failed to analyze question.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: User approves query and clicks "Confirm & run query"
  const handleConfirmQuery = async () => {
    if (!currentPreview) return;
    setIsExecuting(true);
    setError(null);

    try {
      const exec = await api.previews.confirm(currentPreview.id, currentPreview.digest);
      if (exec.success && exec.result) {
        setCurrentResult(exec.result);
        setStage('result');
      } else {
        throw new Error(exec.message || 'Execution failed');
      }
    } catch (err: any) {
      console.error('Execution error:', err);
      setError(err.message || 'Failed to execute query on PostgreSQL.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset to ask new inquiry
  const handleNewQuestion = () => {
    setStage('input');
    setQuestion('');
    setCurrentAnalysis(null);
    setCurrentPreview(null);
    setCurrentResult(null);
    setError(null);
    setClarificationQuestion(null);
  };

  // If no datasets exist, present a friendly onboarding card with sample seeder
  if (datasets.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-sm">
          <Database className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome to ClaritySQL
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            Transparent AI data analysis with schema inspection, AST-validated SQL generation, and explicit confirmation before execution.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            id="seed-sample-dataset-btn"
            onClick={handleSeedSample}
            disabled={isSeeding}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {isSeeding ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Creating sample college data...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Load Sample College Dataset</span>
              </>
            )}
          </button>

          <button
            id="onboarding-import-csv-btn"
            onClick={onOpenImport}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Import your own CSV</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {stage === 'input' && (
        <QuestionInput
          onSubmit={handleQuestionSubmit}
          isLoading={isLoading}
          loadingStep={loadingStep}
          error={error}
          clarificationQuestion={clarificationQuestion}
        />
      )}

      {stage === 'review' && currentPreview && (
        <QueryReviewCard
          question={question}
          interpretation={currentAnalysis as any}
          preview={currentPreview}
          datasetName={activeDataset?.display_name || 'Active Dataset'}
          onConfirm={handleConfirmQuery}
          onEditQuestion={() => setStage('input')}
          isExecuting={isExecuting}
        />
      )}

      {stage === 'result' && currentResult && (
        <ResultView
          question={question}
          result={currentResult}
          preview={currentPreview}
          onNewQuestion={handleNewQuestion}
        />
      )}
    </div>
  );
}
