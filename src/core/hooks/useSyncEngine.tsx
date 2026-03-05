import React, { createContext, useContext, useEffect, useState } from 'react';
import { syncEngine } from '../services/SyncEngine';
import { useAppContext } from './useAppContext';

interface SyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt?: number;
  triggerSyncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType>({
  isOnline: true,
  isSyncing: false,
  triggerSyncNow: async () => {},
});

export const SyncEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { org } = useAppContext();
  const [status, setStatus] = useState(syncEngine.getStatus());

  useEffect(() => {
    if (org) {
      syncEngine.start(org.id);
    } else {
      syncEngine.stop();
    }

    const unsubscribe = syncEngine.subscribe(() => {
      setStatus(syncEngine.getStatus());
    });

    return () => {
      unsubscribe();
      syncEngine.stop();
    };
  }, [org]);

  const triggerSyncNow = async () => {
    if (org) {
      await syncEngine.triggerSyncNow(org.id);
    }
  };

  return (
    <SyncContext.Provider value={{ ...status, triggerSyncNow }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSyncEngine = () => useContext(SyncContext);
