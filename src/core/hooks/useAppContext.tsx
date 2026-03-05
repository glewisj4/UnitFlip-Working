import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Org, Role, FeatureFlags, FeatureFlagKey } from '../models/auth';
import { AppContextService } from '../services/AppContextService';
import { FeatureFlagService } from '../services/FeatureFlagService';

interface AppContextType {
  user: User | null;
  org: Org | null;
  role: Role | null;
  flags: FeatureFlags | null;
  isLoaded: boolean;
  setRole: (role: Role) => Promise<void>;
  setFlag: (key: FeatureFlagKey, value: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadContext = async () => {
      try {
        // Load user/org/role context
        const context = await AppContextService.getContext();
        setUser(context.user);
        setOrg(context.org);
        setRole(context.role);

        // Load feature flags for the org
        const loadedFlags = await FeatureFlagService.getFlags(context.org.id);
        setFlags(loadedFlags);
      } catch (error) {
        console.error('Failed to initialize app context', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadContext();
  }, []);

  const updateRole = async (newRole: Role) => {
    await AppContextService.setRole(newRole);
    setRole(newRole);
  };

  const updateFlag = async (key: FeatureFlagKey, value: boolean) => {
    if (!org || !flags) return;
    await FeatureFlagService.setFlag(org.id, key, value);
    setFlags(prev => prev ? { ...prev, [key]: value } : null);
  };

  return (
    <AppContext.Provider value={{ 
      user, 
      org, 
      role, 
      flags, 
      isLoaded, 
      setRole: updateRole, 
      setFlag: updateFlag 
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};
