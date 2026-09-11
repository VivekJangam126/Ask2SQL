/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { DataProvider } from './context/DataContext.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { AppLayout } from './components/layout/AppLayout.tsx';
import { AnalystView } from './components/analyst/AnalystView.tsx';
import { DatabaseView } from './components/database/DatabaseView.tsx';
import { SchemaView } from './components/schema/SchemaView.tsx';
import { HistoryView } from './components/history/HistoryView.tsx';
import { AdminView } from './components/admin/AdminView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { MemberStatusScreen } from './components/auth/MemberStatusScreen.tsx';
import { Database } from 'lucide-react';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<string>('analyst');
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);

  // Initialize theme from storage
  useEffect(() => {
    try {
      const theme = localStorage.getItem('claritysql_theme') || 'system';
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    } catch {}
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F7FB] dark:bg-slate-950 text-slate-500">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 mb-4 animate-pulse">
          <Database className="w-5 h-5" />
        </div>
        <p className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Initializing ClaritySQL...
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  // Check if member access is pending, rejected, or suspended
  const membershipStatus = user.membership?.status;
  const isSuspended = user.account_state === 'suspended' || membershipStatus === 'SUSPENDED';
  const isPendingOrRejected = membershipStatus === 'PENDING' || membershipStatus === 'REJECTED';

  if (isSuspended || isPendingOrRejected) {
    return <MemberStatusScreen />;
  }

  return (
    <DataProvider>
      <AppLayout currentView={currentView} onNavigate={setCurrentView}>
        {currentView === 'analyst' && (
          <AnalystView onOpenImport={() => setIsImportWizardOpen(true)} />
        )}
        {currentView === 'database' && (
          <DatabaseView
            onOpenImport={() => setIsImportWizardOpen(true)}
            onNavigate={setCurrentView}
          />
        )}
        {currentView === 'schema' && <SchemaView />}
        {currentView === 'history' && <HistoryView />}
        {currentView === 'admin' && <AdminView />}
        {currentView === 'settings' && <SettingsView />}
      </AppLayout>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
