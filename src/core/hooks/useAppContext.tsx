import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { FeatureFlags, FeatureFlagKey, LocalSession, Org, Permission, Role } from '../models/auth';
import { AppContextService } from '../services/AppContextService';
import { AuthPolicyService } from '../services/AuthPolicyService';
import { FeatureFlagService } from '../services/FeatureFlagService';

interface AppContextType {
  session: LocalSession | null;
  user: LocalSession['user'] | null;
  org: LocalSession['org'] | null;
  role: Role | null;
  permissions: Permission[];
  flags: FeatureFlags | null;
  isLoaded: boolean;
  hasPermission: (permission: Permission) => boolean;
  signInLocal: (input: { displayName: string; orgName: string; role: Role }) => Promise<void>;
  signOut: () => Promise<void>;
  setRole: (role: Role) => Promise<void>;
  setFlag: (key: FeatureFlagKey, value: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadContext = async () => {
    try {
      const loadedSession = await AppContextService.getContext();
      setSession(loadedSession);

      if (loadedSession?.org) {
        const loadedFlags = await FeatureFlagService.getFlags(loadedSession.org.id);
        setFlags(loadedFlags);
      } else {
        setFlags(null);
      }
    } catch (error) {
      console.error('Failed to initialize app context', error);
      setSession(null);
      setFlags(null);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  const signInLocal = async (input: { displayName: string; orgName: string; role: Role }) => {
    const nextSession = await AppContextService.signInLocal(input);
    setSession(nextSession);
    const loadedFlags = await FeatureFlagService.getFlags(nextSession.org.id);
    setFlags(loadedFlags);
  };

  const signOut = async () => {
    await AppContextService.signOut();
    setSession(null);
    setFlags(null);
  };

  const updateRole = async (newRole: Role) => {
    const updatedSession = await AppContextService.setRole(newRole);
    if (!updatedSession) return;
    setSession(updatedSession);
  };

  const updateFlag = async (key: FeatureFlagKey, value: boolean) => {
    if (!session?.org || !flags) return;
    await FeatureFlagService.setFlag(session.org.id, key, value);
    setFlags((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const contextValue: AppContextType = {
    session,
    user: session?.user || null,
    org: session?.org || null,
    role: session?.role || null,
    permissions: session?.permissions || [],
    flags,
    isLoaded,
    hasPermission: (permission) => AuthPolicyService.hasPermission(session?.permissions, permission),
    signInLocal,
    signOut,
    setRole: updateRole,
    setFlag: updateFlag,
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};
