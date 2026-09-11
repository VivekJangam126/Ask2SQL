import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  ExternalLink,
  ChevronRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import { HistoryItem } from '../../types/index.ts';
import { api } from '../../lib/api.ts';
import { QueryDetailDrawer } from './QueryDetailDrawer.tsx';

export function HistoryView() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await api.history.list(search, statusFilter);
      setHistory(data.history);
    } catch (err) {
      console.error('Failed to load query history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <History className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Query History & Audit Log</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Complete trace of natural language prompts, generated SQL, verification digests, and execution runtimes
          </p>
        </div>

        <button
          onClick={loadHistory}
          disabled={isLoading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search questions or SQL text..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white"
          />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="flex-1 sm:flex-none text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All statuses</option>
            <option value="executed">Executed successfully</option>
            <option value="ready_for_review">Draft / Unexecuted</option>
            <option value="failed">Failed / Canceled</option>
          </select>
        </div>
      </div>

      {/* Table / List View */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Loading query history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No queries executed yet.</p>
          </div>
        ) : (
          history.map(item => {
            const isCompleted = item.execution_status === 'completed' || item.status === 'executed';
            const isPending = item.status === 'ready_for_review';

            return (
              <div
                key={item.id}
                id={`history-row-${item.id}`}
                onClick={() => setSelectedItem(item)}
                className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0 pr-4">
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : isPending ? (
                      <Clock className="w-4 h-4 text-amber-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      "{item.question}"
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                      {item.duration_ms !== undefined && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{item.duration_ms}ms</span>
                        </>
                      )}

                      {item.total_rows !== undefined && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{item.total_rows} rows</span>
                        </>
                      )}

                      {item.dataset_name && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[120px] text-slate-500 font-medium">
                            {item.dataset_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                        : isPending
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {isCompleted ? 'Executed' : isPending ? 'Unexecuted' : 'Failed'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Drawer */}
      <QueryDetailDrawer
        isOpen={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
      />
    </div>
  );
}
