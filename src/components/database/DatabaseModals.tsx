import React, { useState } from 'react';
import { api } from '../../lib/api.ts';
import { Plus, Trash2, AlertTriangle, Database, Layers } from 'lucide-react';

interface CreateTableModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateTableModal({ datasetId, isOpen, onClose, onSuccess }: CreateTableModalProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<
    { name: string; type: string; isNullable: boolean; isPrimaryKey?: boolean }[]
  >([
    { name: 'id', type: 'SERIAL', isNullable: false, isPrimaryKey: true },
    { name: 'name', type: 'TEXT', isNullable: false },
    { name: 'created_at', type: 'TIMESTAMP', isNullable: true },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddColumn = () => {
    setColumns([...columns, { name: '', type: 'TEXT', isNullable: true }]);
  };

  const handleRemoveColumn = (idx: number) => {
    setColumns(columns.filter((_, i) => i !== idx));
  };

  const handleUpdateColumn = (idx: number, field: string, value: any) => {
    const updated = [...columns];
    updated[idx] = { ...updated[idx], [field]: value };
    setColumns(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) {
      setError('Table name is required');
      return;
    }
    const cleanCols = columns.filter(c => c.name.trim().length > 0);
    if (cleanCols.length === 0) {
      setError('At least one valid column is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.data.createTable(datasetId, tableName.trim(), cleanCols);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create table');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <span>Create New PostgreSQL Table</span>
        </h3>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Table Name
            </label>
            <input
              type="text"
              id="new-table-name-input"
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="e.g. course_enrollments"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Column Definitions
              </label>
              <button
                type="button"
                onClick={handleAddColumn}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Column</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {columns.map((col, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <input
                    type="text"
                    value={col.name}
                    onChange={e => handleUpdateColumn(idx, 'name', e.target.value)}
                    placeholder="column_name"
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />

                  <select
                    value={col.type}
                    onChange={e => handleUpdateColumn(idx, 'type', e.target.value)}
                    className="w-28 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="SERIAL">SERIAL (PK)</option>
                    <option value="INTEGER">INTEGER</option>
                    <option value="BIGINT">BIGINT</option>
                    <option value="TEXT">TEXT</option>
                    <option value="VARCHAR(255)">VARCHAR(255)</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                    <option value="NUMERIC(12,2)">NUMERIC(12,2)</option>
                    <option value="DOUBLE PRECISION">DOUBLE PRECISION</option>
                    <option value="TIMESTAMP">TIMESTAMP</option>
                    <option value="DATE">DATE</option>
                  </select>

                  <label className="flex items-center gap-1 text-[11px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={col.isNullable}
                      onChange={e => handleUpdateColumn(idx, 'isNullable', e.target.checked)}
                      className="rounded"
                    />
                    <span>Null</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-create-table-btn"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Table...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DropTableModalProps {
  datasetId: string;
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DropTableModal({
  datasetId,
  tableName,
  isOpen,
  onClose,
  onSuccess,
}: DropTableModalProps) {
  const [typedConfirm, setTypedConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const expectedText = `DROP ${tableName}`;

  const handleDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typedConfirm.trim() !== expectedText) {
      setError(`Confirmation text must match exactly: "${expectedText}"`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.data.dropTable(datasetId, tableName, tableName);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to drop table');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          <span>Drop Table: {tableName}</span>
        </h3>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          This operation will permanently drop table <strong>{tableName}</strong> and delete all stored records.
        </p>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleDrop} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Type <span className="font-mono text-rose-600">{expectedText}</span> to confirm:
            </label>
            <input
              type="text"
              id="confirm-drop-table-input"
              value={typedConfirm}
              onChange={e => setTypedConfirm(e.target.value)}
              placeholder={expectedText}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-drop-table-btn"
              disabled={isSubmitting || typedConfirm.trim() !== expectedText}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Dropping...' : 'Confirm Drop Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteDatabaseModalProps {
  datasetId: string;
  datasetName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteDatabaseModal({
  datasetId,
  datasetName,
  isOpen,
  onClose,
  onSuccess,
}: DeleteDatabaseModalProps) {
  const [typedConfirm, setTypedConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const expectedText = `DELETE ${datasetName}`;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typedConfirm.trim() !== expectedText) {
      setError(`Confirmation text must match exactly: "${expectedText}"`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.data.deleteDatabase(datasetId, datasetName);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete database');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          <span>Delete Database: {datasetName}</span>
        </h3>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          This operation will permanently drop the entire database schema and all tables and records within it.
        </p>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleDelete} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Type <span className="font-mono text-rose-600">{expectedText}</span> to confirm:
            </label>
            <input
              type="text"
              id="confirm-delete-db-input"
              value={typedConfirm}
              onChange={e => setTypedConfirm(e.target.value)}
              placeholder={expectedText}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="confirm-delete-db-btn"
              disabled={isSubmitting || typedConfirm.trim() !== expectedText}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Deleting Database...' : 'Confirm Permanent Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
