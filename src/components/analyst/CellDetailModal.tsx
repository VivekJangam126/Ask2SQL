import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface CellDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  value: any;
}

export function CellDetailModal({ isOpen, onClose, columnName, value }: CellDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const displayString = typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? 'NULL');

  const handleCopy = () => {
    navigator.clipboard.writeText(displayString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="cell-detail-modal"
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              Cell Inspector
            </h3>
            <p className="text-xs text-slate-500 font-mono">Column: {columnName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 overflow-auto max-h-72 whitespace-pre-wrap break-all border border-slate-200 dark:border-slate-800">
            {displayString}
          </pre>
        </div>

        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
