import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  Database,
  Table,
  Check,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { CsvUploadInfo } from '../../types/index.ts';

interface CsvImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function CsvImportWizard({ isOpen, onClose, onSuccess }: CsvImportWizardProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<CsvUploadInfo | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [tableName, setTableName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a valid .csv file.');
      return;
    }
    setFile(f);
    setError(null);
    setIsUploading(true);

    try {
      const info = await api.uploads.uploadCsv(f);
      setUploadInfo(info);
      // Auto default table name from filename
      const defaultTable = f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      setTableName(defaultTable);
      setDatasetName(f.name.replace(/\.[^/.]+$/, ''));
      setStep('preview');
    } catch (err: any) {
      console.error('CSV upload error:', err);
      setError(err.message || 'Failed to process CSV');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImport = async () => {
    if (!uploadInfo) return;
    setIsImporting(true);
    setError(null);

    try {
      await api.uploads.importDataset(uploadInfo.uploadId, datasetName.trim(), tableName.trim());
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import dataset into PostgreSQL');
      setIsImporting(false);
    }
  };

  const handleCloseAttempt = () => {
    if (step === 'preview' && uploadInfo) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <div
      id="csv-import-wizard-modal"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-900 dark:text-white">
                Import CSV into PostgreSQL
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Type-inferred staging with automatic schema extraction
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseAttempt}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".csv"
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>

                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Click to choose a CSV or drag and drop here
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Supports comma or semicolon delimited files up to 25MB
                </p>
              </div>

              {isUploading && (
                <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-3">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Staging CSV and inferring PostgreSQL column types...</span>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && uploadInfo && (
            <div className="space-y-5">
              {/* Staging summary metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Total Rows</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                    {uploadInfo.totalRows.toLocaleString()}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Columns</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                    {uploadInfo.totalColumns}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">File Size</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                    {(uploadInfo.sizeBytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              {/* Dataset and Table Naming */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Dataset Name
                  </label>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={e => setDatasetName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Target Table Name
                  </label>
                  <input
                    type="text"
                    value={tableName}
                    onChange={e => setTableName(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Inferred Column Types */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Inferred PostgreSQL Columns ({uploadInfo.columns.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {uploadInfo.columns.map((col, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-800 dark:text-slate-200 font-medium">
                          {col.internalName}
                        </span>
                        {col.originalName !== col.internalName && (
                          <span className="text-[10px] text-slate-400">
                            (was: {col.originalName})
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300">
                        {col.detectedType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample Data Preview */}
              {uploadInfo.previewRows && uploadInfo.previewRows.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                    Sample Data Preview (First {uploadInfo.previewRows.length} Rows)
                  </label>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto max-h-44">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                        <tr>
                          {uploadInfo.columns.slice(0, 5).map(c => (
                            <th key={c.internalName} className="p-2">
                              {c.internalName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {uploadInfo.previewRows.map((r, i) => (
                          <tr key={i}>
                            {uploadInfo.columns.slice(0, 5).map(c => (
                              <td key={c.internalName} className="p-2 truncate max-w-[140px]">
                                {String(r[c.internalName] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-800/40">
          {step === 'preview' && (
            <button
              onClick={() => setStep('upload')}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Choose different file
            </button>
          )}

          <button
            onClick={handleCloseAttempt}
            disabled={isImporting}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>

          {step === 'preview' && (
            <button
              id="confirm-import-csv-btn"
              onClick={handleImport}
              disabled={isImporting || !tableName.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing into PostgreSQL...</span>
                </>
              ) : (
                <>
                  <span>Create Table & Dataset</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-60">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Discard uploaded file?
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The staged CSV will be removed and no PostgreSQL table will be created.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Keep editing
              </button>
              <button
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
