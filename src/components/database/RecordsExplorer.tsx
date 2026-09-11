import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Dataset, SchemaMetadata, TableMetadata } from '../../types/index.ts';
import {
  Table as TableIcon,
  Search,
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';

interface RecordsExplorerProps {
  dataset: Dataset;
  schema: SchemaMetadata | null;
  onRefreshSchema: () => void;
  onOpenCreateTable: () => void;
  onOpenDropTable: (tableName: string) => void;
}

export function RecordsExplorer({
  dataset,
  schema,
  onRefreshSchema,
  onOpenCreateTable,
  onOpenDropTable,
}: RecordsExplorerProps) {
  const { user } = useAuth();

  const [selectedTable, setSelectedTable] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutation Modals
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<any | null>(null);
  const [appendCsvOpen, setAppendCsvOpen] = useState(false);

  // Preview & Confirm State
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null);

  // Form states
  const [formFields, setFormFields] = useState<Record<string, any>>({});
  const [csvInput, setCsvInput] = useState('');
  const [isSubmittingCsv, setIsSubmittingCsv] = useState(false);

  const permissions = dataset.permissions || {
    isAdmin: user?.membership?.role === 'ORG_ADMIN',
    canRead: true,
    canInsert: user?.membership?.role === 'ORG_ADMIN',
    canUpdate: user?.membership?.role === 'ORG_ADMIN',
    canDeleteRecords: user?.membership?.role === 'ORG_ADMIN',
    canImportCsv: user?.membership?.role === 'ORG_ADMIN',
    canExport: true,
  };

  const tables = schema?.tables || [];

  // Set initial selected table
  useEffect(() => {
    if (tables.length > 0 && (!selectedTable || !tables.some(t => t.name === selectedTable))) {
      setSelectedTable(tables[0].name);
    }
  }, [tables, selectedTable]);

  // Load records
  const loadRecords = async () => {
    if (!dataset.id || !selectedTable) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.data.getTableRecords(dataset.id, selectedTable, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        search: search.trim() || undefined,
      });
      setRecords(data.rows || data.records || []);
      setColumns(data.columns || []);
      setTotalRecords(data.totalRows ?? data.total ?? data.pagination?.total ?? 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [selectedTable, search]);

  useEffect(() => {
    loadRecords();
  }, [dataset.id, selectedTable, page, search]);

  const currentTableMetadata = tables.find(t => t.name === selectedTable);

  // Open Insert Modal
  const handleOpenInsert = () => {
    const initial: Record<string, any> = {};
    currentTableMetadata?.columns.forEach(col => {
      initial[col.name] = '';
    });
    setFormFields(initial);
    setPreviewData(null);
    setInsertModalOpen(true);
  };

  // Preview Insert
  const handlePreviewInsert = async () => {
    setError(null);
    try {
      const res = await api.data.previewMutation(dataset.id, selectedTable, {
        operation: 'insert',
        recordData: formFields,
      });
      setPreviewData(res.preview);
    } catch (err: any) {
      setError(err.message || 'Failed to generate insert preview');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (row: any) => {
    setEditRecord(row);
    setFormFields({ ...row });
    setPreviewData(null);
  };

  // Preview Update
  const handlePreviewUpdate = async () => {
    if (!editRecord) return;
    setError(null);
    try {
      const pkCol = currentTableMetadata?.primaryKeys[0] || 'id';
      const res = await api.data.previewMutation(dataset.id, selectedTable, {
        operation: 'update',
        recordData: formFields,
        targetCriteria: { [pkCol]: editRecord[pkCol] },
      });
      setPreviewData(res.preview);
    } catch (err: any) {
      setError(err.message || 'Failed to generate update preview');
    }
  };

  // Open Delete Modal
  const handleOpenDelete = (row: any) => {
    setDeleteRecord(row);
    setPreviewData(null);
  };

  // Preview Delete
  const handlePreviewDelete = async () => {
    if (!deleteRecord) return;
    setError(null);
    try {
      const pkCol = currentTableMetadata?.primaryKeys[0] || 'id';
      const res = await api.data.previewMutation(dataset.id, selectedTable, {
        operation: 'delete_records',
        targetCriteria: { [pkCol]: deleteRecord[pkCol] },
      });
      setPreviewData(res.preview);
    } catch (err: any) {
      setError(err.message || 'Failed to generate delete preview');
    }
  };

  // Confirm Preview Execution
  const handleConfirmExecution = async () => {
    if (!previewData) return;
    setIsConfirming(true);
    setError(null);
    try {
      const res = await api.data.confirmOperation(previewData.previewId, previewData.digest);
      setMutationSuccess(`Operation confirmed successfully. ${res.result?.affectedRows || 1} row(s) modified.`);
      setInsertModalOpen(false);
      setEditRecord(null);
      setDeleteRecord(null);
      setPreviewData(null);
      await loadRecords();
      onRefreshSchema();
    } catch (err: any) {
      setError(err.message || 'Failed to execute operation');
    } finally {
      setIsConfirming(false);
    }
  };

  // Append CSV
  const handleAppendCsv = async () => {
    if (!csvInput.trim()) return;
    setIsSubmittingCsv(true);
    setError(null);
    try {
      const res = await api.data.appendCsv(dataset.id, selectedTable, csvInput);
      setMutationSuccess(`Successfully appended ${res.insertedCount} records to ${selectedTable}!`);
      setAppendCsvOpen(false);
      setCsvInput('');
      await loadRecords();
      onRefreshSchema();
    } catch (err: any) {
      setError(err.message || 'Failed to append CSV data');
    } finally {
      setIsSubmittingCsv(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden select-none">
      {/* Header & Table Selector */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-semibold">
            <TableIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Table:</span>
          </div>

          <select
            id="table-selector-records-explorer"
            value={selectedTable}
            onChange={e => setSelectedTable(e.target.value)}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {tables.map(t => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.rowCount} rows)
              </option>
            ))}
          </select>

          {permissions.isAdmin && (
            <button
              id="create-table-btn"
              onClick={onOpenCreateTable}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
              title="Create a new table in this database"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Table</span>
            </button>
          )}

          {permissions.isAdmin && selectedTable && (
            <button
              id="drop-table-btn"
              onClick={() => onOpenDropTable(selectedTable)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 text-slate-400 transition-colors"
              title={`Drop table ${selectedTable}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Append CSV button */}
          <button
            id="append-csv-btn"
            onClick={() => setAppendCsvOpen(true)}
            disabled={!permissions.canImportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            title={permissions.canImportCsv ? 'Append CSV data to table' : 'Append CSV permission required'}
          >
            <Upload className="w-3.5 h-3.5 text-indigo-500" />
            <span>Append CSV</span>
          </button>

          {/* Export CSV button */}
          <a
            id="export-table-csv-link"
            href={api.data.exportCsvUrl(dataset.id, selectedTable)}
            download={`${selectedTable}.csv`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
            title="Download table data as clean CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export</span>
          </a>

          {/* Add Record button */}
          <button
            id="insert-record-btn"
            onClick={handleOpenInsert}
            disabled={!permissions.canInsert}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={permissions.canInsert ? 'Insert a new record' : 'Insert permission required'}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Record</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {mutationSuccess && (
        <div className="p-3 mx-4 mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{mutationSuccess}</span>
          </div>
          <button onClick={() => setMutationSuccess(null)} className="text-slate-400 hover:text-slate-600 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 mx-4 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="p-3 sm:px-5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            id="records-search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Filter ${selectedTable} records...`}
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {records.length} of {totalRecords} records
          </span>
          <button
            onClick={loadRecords}
            disabled={isLoading}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
            title="Refresh table records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Data Grid Table */}
      <div className="overflow-x-auto min-h-[220px]">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
            <p className="text-xs">Loading records from PostgreSQL...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <TableIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No records found</p>
            <p className="text-[11px] text-slate-400 mt-1">This table is empty or matches no filters.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-850/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <tr>
                {columns.map(col => (
                  <th key={col.name} className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    {col.name}
                  </th>
                ))}
                {(permissions.canUpdate || permissions.canDeleteRecords) && (
                  <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {records.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-colors">
                  {columns.map(col => (
                    <td key={col.name} className="px-4 py-2.5 whitespace-nowrap max-w-[240px] truncate">
                      {row[col.name] !== null && row[col.name] !== undefined ? String(row[col.name]) : (
                        <span className="text-slate-300 dark:text-slate-600 italic">null</span>
                      )}
                    </td>
                  ))}
                  {(permissions.canUpdate || permissions.canDeleteRecords) && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {permissions.canUpdate && (
                          <button
                            id={`edit-record-${idx}-btn`}
                            onClick={() => handleOpenEdit(row)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                            title="Edit record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {permissions.canDeleteRecords && (
                          <button
                            id={`delete-record-${idx}-btn`}
                            onClick={() => handleOpenDelete(row)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="p-3 sm:px-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <div>
          Page {page} of {Math.max(1, Math.ceil(totalRecords / pageSize))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * pageSize >= totalRecords}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* INSERT MODAL */}
      {insertModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              <span>Insert Record into {selectedTable}</span>
            </h3>

            {previewData ? (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Validated Mutation Preview (Digest: {previewData.digest})</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">
                    Expected Affected Rows: <strong>{previewData.expectedAffectedCount}</strong>
                  </p>
                  <pre className="font-mono text-[10px] bg-white dark:bg-slate-900 p-2 rounded border border-indigo-100 dark:border-indigo-900/60 overflow-x-auto">
                    {previewData.sql}
                  </pre>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => setPreviewData(null)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Back to Edit
                  </button>
                  <button
                    id="confirm-insert-execution-btn"
                    onClick={handleConfirmExecution}
                    disabled={isConfirming}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isConfirming ? 'Executing...' : 'Confirm & Commit Insert'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentTableMetadata?.columns.map(col => (
                    <div key={col.name}>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {col.name} <span className="text-[10px] text-slate-400">({col.dataType})</span>
                      </label>
                      <input
                        type="text"
                        value={formFields[col.name] ?? ''}
                        onChange={e => setFormFields({ ...formFields, [col.name]: e.target.value })}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setInsertModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    id="preview-insert-btn"
                    onClick={handlePreviewInsert}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Preview Insert
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-600" />
              <span>Update Record in {selectedTable}</span>
            </h3>

            {previewData ? (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Validated Update Preview (Digest: {previewData.digest})</span>
                  </div>
                  <pre className="font-mono text-[10px] bg-white dark:bg-slate-900 p-2 rounded border border-indigo-100 dark:border-indigo-900/60 overflow-x-auto">
                    {previewData.sql}
                  </pre>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    onClick={() => setPreviewData(null)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Back to Edit
                  </button>
                  <button
                    id="confirm-update-execution-btn"
                    onClick={handleConfirmExecution}
                    disabled={isConfirming}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isConfirming ? 'Updating...' : 'Confirm & Commit Update'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentTableMetadata?.columns.map(col => {
                    const isPk = currentTableMetadata.primaryKeys.includes(col.name);
                    return (
                      <div key={col.name}>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          {col.name} {isPk && <span className="text-amber-500 font-bold">(PK)</span>}
                        </label>
                        <input
                          type="text"
                          disabled={isPk}
                          value={formFields[col.name] ?? ''}
                          onChange={e => setFormFields({ ...formFields, [col.name]: e.target.value })}
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                            isPk
                              ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:border-indigo-500'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setEditRecord(null)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    id="preview-update-btn"
                    onClick={handlePreviewUpdate}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Preview Update
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DELETE RECORD MODAL */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-rose-600 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              <span>Confirm Delete Record</span>
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Are you sure you want to delete this row from <strong>{selectedTable}</strong>? This action cannot be undone.
            </p>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono max-h-32 overflow-y-auto">
              {JSON.stringify(deleteRecord, null, 2)}
            </div>

            {previewData ? (
              <div className="space-y-3">
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-xs font-mono">
                  {previewData.sql}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDeleteRecord(null)}
                    className="px-3.5 py-1.5 rounded-lg border text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    id="confirm-delete-execution-btn"
                    onClick={handleConfirmExecution}
                    disabled={isConfirming}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                  >
                    {isConfirming ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeleteRecord(null)}
                  className="px-3.5 py-1.5 rounded-lg border text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  id="preview-delete-btn"
                  onClick={handlePreviewDelete}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold shadow-sm"
                >
                  Preview Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPEND CSV MODAL */}
      {appendCsvOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              <span>Append CSV into {selectedTable}</span>
            </h3>

            <p className="text-xs text-slate-500">
              Paste or upload CSV text. The headers must match the columns in <strong>{selectedTable}</strong>. Existing table schema will be preserved without dropping.
            </p>

            <textarea
              id="append-csv-textarea"
              rows={8}
              value={csvInput}
              onChange={e => setCsvInput(e.target.value)}
              placeholder="id,first_name,last_name,email&#10;101,Jane,Doe,jane@example.com"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            />

            <div className="flex items-center justify-between pt-2">
              <label className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-700">
                <span>Upload CSV File</span>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => setCsvInput(String(ev.target?.result || ''));
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAppendCsvOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  id="submit-append-csv-btn"
                  onClick={handleAppendCsv}
                  disabled={isSubmittingCsv || !csvInput.trim()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {isSubmittingCsv ? 'Appending...' : 'Validate & Append'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
