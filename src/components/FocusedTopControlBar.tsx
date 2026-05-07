import React, { useState } from 'react';
import { Menu, RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { DevSeedService } from '../core/services/DevSeedService';

interface FocusedTopControlBarProps {
  title: string;
  leftControl?: React.ReactNode;
  onSwitchFullMode?: () => void;
  secondaryMenuContent?: (closeMenu: () => void) => React.ReactNode;
}

export const FocusedTopControlBar: React.FC<FocusedTopControlBarProps> = ({
  title,
  leftControl,
  onSwitchFullMode,
  secondaryMenuContent,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSeedingDemoData, setIsSeedingDemoData] = useState(false);
  const { org, user, role, permissions, signOut } = useAppContext();
  const { isOnline, isSyncing, lastSyncAt, triggerSyncNow } = useSyncEngine();
  const canUseDeveloperTools = AuthPolicyService.canUseDeveloperTools(role, permissions);

  const handleSeedDemoData = async () => {
    if (isSeedingDemoData || !canUseDeveloperTools || !org || !user) return;

    setIsSeedingDemoData(true);
    try {
      await DevSeedService.seedDemoData(org.id, user.id);
      window.location.reload();
    } catch (error) {
      console.error('[DevSeedTrigger] Demo data seed failed.', error);
      setIsSeedingDemoData(false);
    }
  };

  const handleSwitchFullMode = () => {
    setIsMenuOpen(false);
    onSwitchFullMode?.();
  };

  const handleSignOut = async () => {
    await signOut();
    setIsMenuOpen(false);
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[80] h-[calc(3.5rem+env(safe-area-inset-top))] border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur">
      <div className="grid h-14 grid-cols-[88px_minmax(0,1fr)_88px] items-center px-2 sm:grid-cols-[96px_minmax(0,1fr)_96px] sm:px-4">
        <div className="flex min-w-0 items-center justify-start">{leftControl}</div>
        <div className="min-w-0 px-2 text-center text-sm font-semibold text-slate-900 sm:text-base">
          <span className="block truncate">{title}</span>
        </div>
        <div className="relative flex items-center justify-end">
          <button
            type="button"
            onClick={() => setIsMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
            aria-label="Focused mode menu"
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {isMenuOpen ? (
            <div className="absolute right-0 top-14 w-64 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-xl">
              <button
                type="button"
                onClick={handleSwitchFullMode}
                className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-slate-50"
              >
                Switch to Full Mode
              </button>

              {secondaryMenuContent ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  {secondaryMenuContent(() => setIsMenuOpen(false))}
                </>
              ) : null}

              <div className="my-1 border-t border-slate-100" />
              {!isOnline ? (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-red-600">
                  <WifiOff size={15} />
                  Offline
                </div>
              ) : isSyncing ? (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-blue-600">
                  <RefreshCw size={15} className="animate-spin" />
                  Syncing
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    triggerSyncNow();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-green-700 hover:bg-slate-50"
                  title={lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Synced'}
                >
                  <Wifi size={15} />
                  Synced
                </button>
              )}

              {user && org && role ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <div className="rounded-xl px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{role}</div>
                    <div className="mt-1 font-medium text-slate-900">{user.name}</div>
                    <div className="text-xs text-slate-500">{org.name}</div>
                  </div>
                </>
              ) : null}

              {canUseDeveloperTools ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={handleSeedDemoData}
                    disabled={isSeedingDemoData || !org || !user}
                    className="w-full rounded-xl px-3 py-2 text-left font-medium text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSeedingDemoData ? 'Seeding Demo Data...' : 'Seed Demo Data'}
                  </button>
                </>
              ) : null}

              {user ? (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-slate-50"
                  >
                    Switch Session
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
