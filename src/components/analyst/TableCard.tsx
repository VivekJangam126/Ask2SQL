import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Maximize2,
  Minimize2,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { CellDetailModal } from './CellDetailModal.tsx';
import { ExportDialog } from './ExportDialog.tsx';

interface TableCardProps {
  executionId: string;
  columns: { name: string; type?: string }[];
  rows: Record<string, any>[];
  totalRows: number;
  isCapped: boolean;
}

export function TableCard({ executionId, columns, rows, totalRows, isCapped }: TableCardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCol, setFilterCol] = useState(columns[0]?.name || '');
  const [filterVal, setFilterVal] = useState('');
  const [appliedFilter, setAppliedFilter] = useState<{ column: string; value: string } | null>(null);
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [inspectCell, setInspectCell] = useState<{ column: string; value: any } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter & Search
  const filteredRows = useMemo(() => {
    let result = rows;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r =>
        Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
      );
    }

    if (appliedFilter && appliedFilter.value.trim()) {
      const q = appliedFilter.value.toLowerCase();
      result = result.filter(r => {
        const val = r[appliedFilter.column];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
      });
    }

    if (sortCol) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDir === 'asc' ? valA - valB : valB - valA;
        }
        return sortDir === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [rows, searchTerm, appliedFilter, sortCol, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const handleSort = (colName: string) => {
    if (sortCol === colName) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colName);
      setSortDir('asc');
    }
  };

  const applyColumnFilter = () => {
    if (filterVal.trim()) {
      setAppliedFilter({ column: filterCol, value: filterVal.trim() });
      setCurrentPage(1);
    }
    setIsFilterPopoverOpen(false);
  };

  const clearColumnFilter = () => {
    setAppliedFilter(null);
    setFilterVal('');
    setCurrentPage(1);
  };

  const renderTableContent = () => (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Controls Bar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
          {/* Global search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search returned rows..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Column filter toggle */}
          <div className="relative">
            <button
              id="open-table-filter-btn"
              onClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                appliedFilter
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>

            {isFilterPopoverOpen && (
              <div
                id="column-filter-popover"
                className="absolute left-0 top-10 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-3.5 z-40 text-xs space-y-3"
              >
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Select Column
                  </label>
                  <select
                    value={filterCol}
                    onChange={e => setFilterCol(e.target.value)}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  >
                    {columns.map(c => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                    Matches Value
                  </label>
                  <input
                    type="text"
                    placeholder="Enter value..."
                    value={filterVal}
                    onChange={e => setFilterVal(e.target.value)}
                    className="w-full p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsFilterPopoverOpen(false)}
                    className="px-2.5 py-1 rounded-md text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    id="apply-filter-btn"
                    onClick={applyColumnFilter}
                    className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter Chip */}
          {appliedFilter && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs">
              <span>
                {appliedFilter.column}: "{appliedFilter.value}"
              </span>
              <button onClick={clearColumnFilter} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right actions: Export & Expand */}
        <div className="flex items-center gap-2">
          <button
            id="export-csv-btn"
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={isExpanded ? 'Minimize table' : 'Expand table'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Table Data Viewport */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold select-none sticky top-0 z-10 backdrop-blur-xs">
              <th className="px-4 py-3 w-12 text-slate-400 font-normal">#</th>
              {columns.map(col => {
                const isSorted = sortCol === col.name;
                return (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className="px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.name}</span>
                      {isSorted ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-indigo-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-slate-400 font-sans">
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const rowNum = (currentPage - 1) * pageSize + idx + 1;
                return (
                  <tr
                    key={idx}
                    className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 transition-colors group"
                  >
                    <td className="px-4 py-2.5 text-slate-400 text-[11px] font-sans">{rowNum}</td>
                    {columns.map(col => {
                      const val = row[col.name];
                      const isNull = val === null || val === undefined;
                      const strVal = isNull ? 'NULL' : String(val);

                      return (
                        <td
                          key={col.name}
                          onClick={() => setInspectCell({ column: col.name, value: val })}
                          className="px-4 py-2.5 max-w-[240px] truncate text-slate-700 dark:text-slate-300 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400"
                          title="Click to inspect cell"
                        >
                          {isNull ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 font-sans">
                              NULL
                            </span>
                          ) : (
                            strVal
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Status Footer */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-2">
          <span>
            Showing{' '}
            <strong className="text-slate-700 dark:text-slate-300">
              {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-700 dark:text-slate-300">
              {Math.min(currentPage * pageSize, filteredRows.length)}
            </strong>{' '}
            of{' '}
            <strong className="text-slate-700 dark:text-slate-300">{filteredRows.length}</strong> returned
            rows
          </span>
          {isCapped && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              (Result capped at 1,000 max)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Page size select */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Rows:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-slate-700 dark:text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        id="result-table-card"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[350px]"
      >
        {renderTableContent()}
      </div>

      {/* Modals */}
      {inspectCell && (
        <CellDetailModal
          isOpen={Boolean(inspectCell)}
          onClose={() => setInspectCell(null)}
          columnName={inspectCell.column}
          value={inspectCell.value}
        />
      )}

      {isExportModalOpen && (
        <ExportDialog
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          executionId={executionId}
          totalReturnedRows={totalRows}
          filteredRowsCount={filteredRows.length}
          activeFilter={appliedFilter || undefined}
        />
      )}

      {isExpanded && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {renderTableContent()}
          </div>
        </div>
      )}
    </>
  );
}
