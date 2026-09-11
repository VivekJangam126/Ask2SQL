import React, { useState } from 'react';
import { useData } from '../../context/DataContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Database,
  Table as TableIcon,
  RefreshCw,
  Plus,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  HardDrive,
  Calendar,
  Shield,
  Trash2,
  Lock,
  Key,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { RecordsExplorer } from './RecordsExplorer.tsx';
import { CreateTableModal, DropTableModal, DeleteDatabaseModal } from './DatabaseModals.tsx';

interface DatabaseViewProps {
  onOpenImport: () => void;
  onNavigate: (view: string) => void;
}

export function DatabaseView({ onOpenImport, onNavigate }: DatabaseViewProps) {
  const { user } = useAuth();
  const {
    datasets,
    activeDataset,
    setActiveDataset,
    schema,
    isDbConnected,
    dbEngine,
    reconnectDb,
    refreshSchema,
    refreshDatasets,
  } = useData();

  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modals
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [dropTableName, setDropTableName] = useState<string | null>(null);
  const [isDeleteDbOpen, setIsDeleteDbOpen] = useState(false);

  const isAdmin = user?.membership?.role === 'ORG_ADMIN';

  const handleTestConnection = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const ok = await reconnectDb();
      setFeedback(ok ? 'Connection verified successfully.' : 'Unable to connect to database.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefreshSchema = async () => {
    setIsRefreshing(true);
    setFeedback(null);
    try {
      await refreshSchema();
      setFeedback('Schema refreshed successfully.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSeedSample = async () => {
    setIsSeeding(true);
    setFeedback(null);
    try {
      const res = await api.datasets.seedSample();
      await refreshDatasets();
      setFeedback(res.message || 'Sample college dataset ready.');
    } catch (err: any) {
      setFeedback(err.message || 'Failed to seed sample');
    } finally {
      setIsSeeding(false);
    }
  };

  const permissions = activeDataset?.permissions || {
    isAdmin,
    canRead: true,
    canInsert: isAdmin,
    canUpdate: isAdmin,
    canDeleteRecords: isAdmin,
    canImportCsv: isAdmin,
    canExport: true,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Database & Datasets</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage your PostgreSQL schemas, inspect table stats, explore records, and mutate data safely
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="seed-sample-btn-db-view"
            onClick={handleSeedSample}
            disabled={isSeeding}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Creating sample...' : 'Load Sample College DB'}</span>
          </button>

          <button
            id="open-import-wizard-btn"
            onClick={onOpenImport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Import CSV</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Active Dataset Overview Card */}
      {activeDataset ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                    Active Database
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    Schema: {activeDataset.internal_schema}
                  </span>
                  {activeDataset.schema_revision && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Rev: s{activeDataset.schema_revision}.d{activeDataset.data_revision || 0}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {activeDataset.display_name}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="test-connection-btn"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <button
                  id="refresh-schema-btn"
                  onClick={handleRefreshSchema}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  <Layers className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh Schema'}</span>
                </button>

                {isAdmin && (
                  <button
                    id="delete-database-btn"
                    onClick={() => setIsDeleteDbOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-medium transition-colors"
                    title="Permanently drop this database (Admin only)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Database</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Engine</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                  {dbEngine}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Tables</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {schema ? schema.tables.length : 0}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Total Rows</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {schema
                    ? schema.tables.reduce((acc, t) => acc + (t.rowCount || 0), 0).toLocaleString()
                    : '0'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Status</span>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isDbConnected ? 'Ready for queries' : 'Connecting'}
                </p>
              </div>
            </div>

            {/* Permissions Summary Badges */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Key className="w-4 h-4 text-purple-600" />
                <span>Your Active Privileges:</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canRead ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  READ
                </span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canInsert ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  INSERT
                </span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canUpdate ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  UPDATE
                </span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canDeleteRecords ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  DELETE
                </span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canImportCsv ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  CSV_APPEND
                </span>
                <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                  permissions.canExport ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-500 line-through'
                }`}>
                  EXPORT
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Records Explorer & Mutation Studio */}
          <RecordsExplorer
            dataset={activeDataset}
            schema={schema}
            onRefreshSchema={handleRefreshSchema}
            onOpenCreateTable={() => setIsCreateTableOpen(true)}
            onOpenDropTable={tableName => setDropTableName(tableName)}
          />
        </div>
      ) : (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
          No dataset loaded. Click "Load Sample College DB" or "Import CSV" to get started.
        </div>
      )}

      {/* Other Available Datasets */}
      {datasets.length > 1 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            All Configured Datasets ({datasets.length})
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {datasets.map(ds => {
              const isActive = ds.id === activeDataset?.id;
              return (
                <div
                  key={ds.id}
                  onClick={() => setActiveDataset(ds)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {ds.display_name}
                    </h4>
                    {isActive && (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{ds.internal_schema}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {activeDataset && (
        <>
          <CreateTableModal
            datasetId={activeDataset.id}
            isOpen={isCreateTableOpen}
            onClose={() => setIsCreateTableOpen(false)}
            onSuccess={() => {
              refreshSchema();
              setFeedback('Table created successfully.');
            }}
          />

          {dropTableName && (
            <DropTableModal
              datasetId={activeDataset.id}
              tableName={dropTableName}
              isOpen={Boolean(dropTableName)}
              onClose={() => setDropTableName(null)}
              onSuccess={() => {
                refreshSchema();
                setFeedback(`Table ${dropTableName} was dropped.`);
              }}
            />
          )}

          <DeleteDatabaseModal
            datasetId={activeDataset.id}
            datasetName={activeDataset.display_name}
            isOpen={isDeleteDbOpen}
            onClose={() => setIsDeleteDbOpen(false)}
            onSuccess={async () => {
              await refreshDatasets();
              setFeedback(`Database ${activeDataset.display_name} deleted.`);
            }}
          />
        </>
      )}
    </div>
  );
}
