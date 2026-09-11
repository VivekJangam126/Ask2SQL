import React, { useState } from 'react';
import { X, Download, ShieldCheck, FileSpreadsheet } from 'lucide-react';
import { api } from '../../lib/api.ts';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string;
  totalReturnedRows: number;
  filteredRowsCount: number;
  activeFilter?: { column: string; value: string };
  onExportStarted?: () => void;
}

export function ExportDialog({
  isOpen,
  onClose,
  executionId,
  totalReturnedRows,
  filteredRowsCount,
  activeFilter,
  onExportStarted,
}: ExportDialogProps) {
  const [exportScope, setExportScope] = useState<'all' | 'filtered'>('all');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleDownload = () => {
    setIsExporting(true);
    let url = api.executions.downloadCsvUrl(executionId);
    if (exportScope === 'filtered' && activeFilter && activeFilter.value) {
      url = api.executions.downloadCsvUrl(executionId, activeFilter.column, activeFilter.value);
    }

    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `claritysql_export_${executionId.substring(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onExportStarted) onExportStarted();
    setIsExporting(false);
    onClose();
  };

  return (
    <div
      id="export-csv-modal"
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                Export Result to CSV
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct export from verified execution snapshot
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4 text-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Export Scope
            </label>

            <div className="space-y-2">
              <label
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  exportScope === 'all'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="export-scope"
                    checked={exportScope === 'all'}
                    onChange={() => setExportScope('all')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <p className="font-medium text-xs">All returned rows</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Full result set as returned by PostgreSQL query
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-xs font-mono">{totalReturnedRows} rows</span>
              </label>

              {activeFilter && activeFilter.value && (
                <label
                  className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                    exportScope === 'filtered'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="export-scope"
                      checked={exportScope === 'filtered'}
                      onChange={() => setExportScope('filtered')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="font-medium text-xs">Rows matching table filters</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Filtered by "{activeFilter.column}" contains "{activeFilter.value}"
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-xs font-mono">{filteredRowsCount} rows</span>
                </label>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Formula Injection Guard:</strong> Cells beginning with characters (=, +, -, @) are safely escaped to prevent spreadsheet calculation vulnerabilities.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            id="confirm-download-csv-btn"
            onClick={handleDownload}
            disabled={isExporting}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
}
