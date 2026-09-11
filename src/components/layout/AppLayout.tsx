import React, { useState } from 'react';
import { Sidebar } from './Sidebar.tsx';
import { Topbar } from './Topbar.tsx';
import { CsvImportWizard } from '../database/CsvImportWizard.tsx';
import { useData } from '../../context/DataContext.tsx';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface AppLayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export function AppLayout({ currentView, onNavigate, children }: AppLayoutProps) {
  const { isDbConnected, reconnectDb, refreshDatasets } = useData();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F7FB] dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      {/* Desktop Navy Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar
          currentView={currentView}
          onNavigate={onNavigate}
          onOpenImport={() => setIsImportWizardOpen(true)}
        />
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-[260px] h-full z-10">
            <Sidebar
              currentView={currentView}
              onNavigate={view => {
                onNavigate(view);
                setIsMobileMenuOpen(false);
              }}
              onOpenImport={() => {
                setIsImportWizardOpen(true);
                setIsMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Main App Canvas */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Topbar */}
        <Topbar
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onNavigate={onNavigate}
        />

        {/* Database Disconnection Banner */}
        {!isDbConnected && (
          <div
            id="db-disconnected-banner"
            className="bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-900/60 px-4 py-2.5 flex items-center justify-between text-xs text-rose-700 dark:text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Database connection lost. Queries will fail until reconnected.</span>
            </div>
            <button
              onClick={() => reconnectDb()}
              className="inline-flex items-center gap-1 font-semibold underline hover:text-rose-900"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry connection</span>
            </button>
          </div>
        )}

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* CSV Import Wizard Modal */}
      <CsvImportWizard
        isOpen={isImportWizardOpen}
        onClose={() => setIsImportWizardOpen(false)}
        onSuccess={async () => {
          await refreshDatasets();
          onNavigate('database');
        }}
      />
    </div>
  );
}
