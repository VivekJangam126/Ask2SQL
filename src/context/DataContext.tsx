import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Dataset, SchemaMetadata, NotificationItem } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { useAuth } from './AuthContext.tsx';

interface DataContextType {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  setActiveDataset: (dataset: Dataset | null) => void;
  schema: SchemaMetadata | null;
  isLoadingSchema: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  isDbConnected: boolean;
  dbEngine: string;
  aiModel: string;
  refreshDatasets: () => Promise<void>;
  refreshSchema: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  reconnectDb: () => Promise<boolean>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);
  const [schema, setSchema] = useState<SchemaMetadata | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(true);
  const [dbEngine, setDbEngine] = useState<string>('PostgreSQL');
  const [aiModel, setAiModel] = useState<string>('gemini-3.8-flash');

  useEffect(() => {
    api.health.check()
      .then(res => {
        if (res.aiModel) setAiModel(res.aiModel);
        if (res.database?.engine) setDbEngine(res.database.engine);
        if (res.database?.ready !== undefined) setIsDbConnected(res.database.ready);
      })
      .catch(() => {});
  }, []);

  const refreshDatasets = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.datasets.list();
      setDatasets(data.datasets);
      if (data.datasets.length > 0) {
        // Retain current active dataset or pick first
        setActiveDataset(prev => {
          if (prev && data.datasets.some(d => d.id === prev.id)) {
            return data.datasets.find(d => d.id === prev.id)!;
          }
          return data.datasets[0];
        });
      } else {
        setActiveDataset(null);
        setSchema(null);
      }
    } catch (err) {
      console.error('Failed to load datasets:', err);
    }
  }, [user]);

  const refreshSchema = useCallback(async () => {
    if (!activeDataset) {
      setSchema(null);
      return;
    }
    setIsLoadingSchema(true);
    try {
      const meta = await api.datasets.getSchema(activeDataset.id);
      setSchema(meta);
    } catch (err) {
      console.error('Failed to fetch schema:', err);
      setSchema(null);
    } finally {
      setIsLoadingSchema(false);
    }
  }, [activeDataset]);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.notifications.list();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err: any) {
      if (err?.status === 401) return;
      console.warn('Could not refresh notifications:', err?.message || err);
    }
  }, [user]);

  const reconnectDb = async (): Promise<boolean> => {
    if (!activeDataset) return false;
    try {
      const res = await api.datasets.reconnect(activeDataset.id);
      setIsDbConnected(res.success);
      if (res.engine) setDbEngine(res.engine);
      await refreshSchema();
      return res.success;
    } catch {
      setIsDbConnected(false);
      return false;
    }
  };

  const markNotificationRead = async (id: string) => {
    await api.notifications.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllNotificationsRead = async () => {
    await api.notifications.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  // Periodic notifications check
  useEffect(() => {
    if (user) {
      refreshDatasets();
      refreshNotifications();
      const interval = setInterval(refreshNotifications, 15000);
      return () => clearInterval(interval);
    } else {
      setDatasets([]);
      setActiveDataset(null);
      setSchema(null);
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [user, refreshDatasets, refreshNotifications]);

  // Load schema when active dataset changes
  useEffect(() => {
    if (activeDataset) {
      refreshSchema();
    }
  }, [activeDataset, refreshSchema]);

  return (
    <DataContext.Provider
      value={{
        datasets,
        activeDataset,
        setActiveDataset,
        schema,
        isLoadingSchema,
        notifications,
        unreadCount,
        isDbConnected,
        dbEngine,
        aiModel,
        refreshDatasets,
        refreshSchema,
        refreshNotifications,
        reconnectDb,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useData must be used within a DataProvider');
  }
  return ctx;
}
