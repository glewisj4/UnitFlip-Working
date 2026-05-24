import React, { useState } from 'react';
import { Home, Package, ShoppingBag, Wrench, Menu, X, ClipboardList, RefreshCw, Wifi, WifiOff, Shield, Layers3, ShoppingCart, MessageSquareWarning } from 'lucide-react';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { useAppContext } from '../core/hooks/useAppContext';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { DevSeedService } from '../core/services/DevSeedService';
import { FeedbackCategory, FeedbackService } from '../core/services/FeedbackService';
import { FeedbackButton } from './FeedbackButton';
import { FeedbackPanel } from './FeedbackPanel';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  mode?: 'focused' | 'full';
  onModeChange?: (mode: 'focused' | 'full') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange, mode = 'full', onModeChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [includeContext, setIncludeContext] = useState(true);
  const [feedbackSavedCount, setFeedbackSavedCount] = useState(() => FeedbackService.getFeedbackCount());
  const [feedbackSubmitState, setFeedbackSubmitState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [feedbackSubmitMessage, setFeedbackSubmitMessage] = useState<string | undefined>(undefined);
  const [isSeedingDemoData, setIsSeedingDemoData] = useState(false);
  const { isOnline, isSyncing, lastSyncAt, triggerSyncNow } = useSyncEngine();
  const { org, user, role, permissions, signOut } = useAppContext();
  const viewLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    rooms: 'Unit Workspace',
    products: 'All Products',
    'repair-kits': 'Repair Kits',
    checklist: 'Checklist',
    inspections: 'Inspection',
    'unit-management': 'Portfolio',
    procurement: 'Procurement',
    templates: 'Templates',
    admin: 'Retention & Settings',
    'feedback-management': 'Feedback Management',
    'focused-home': 'Focused Home',
    'focused-unit-select': 'Choose Unit',
    'focused-inspection': 'Focused Inspection',
    'focused-summary': 'Inspection Summary',
    'focused-materials': 'Materials Review',
  };

  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

  const canAccessView = (view: Parameters<typeof AuthPolicyService.canAccessView>[1]) =>
    AuthPolicyService.canAccessView(permissions, view);

  const buildFeedbackContext = () => ({
    route: window.location.pathname || '/',
    screen: activeTab,
    activeTab,
    isOnline,
    isSyncing,
    orgId: org?.id,
    userId: user?.id,
  });

  const handleOpenFeedback = () => {
    setFeedbackSubmitState('idle');
    setFeedbackSubmitMessage(undefined);
    setIsFeedbackOpen(true);
    setFeedbackSavedCount(FeedbackService.getFeedbackCount());
    ClientLoggerService.info('Feedback panel opened.', {
      category: 'feedback',
      eventType: 'feedback.panel_opened',
      route: window.location.pathname || '/',
      screen: activeTab,
      contextIds: {
        orgId: org?.id,
        userId: user?.id,
      },
      metadata: {
        activeTab,
      },
    });
  };

  const handleCloseFeedback = () => {
    if (feedbackSubmitState === 'saving') return;
    setIsFeedbackOpen(false);
  };

  const handleSubmitFeedback = () => {
    if (!feedbackMessage.trim()) return;

    setFeedbackSubmitState('saving');
    setFeedbackSubmitMessage('Saving feedback locally...');

    try {
      const record = FeedbackService.saveFeedback({
        category: feedbackCategory,
        message: feedbackMessage,
        includeContext,
        includeDiagnostics,
        context: buildFeedbackContext(),
      });

      setFeedbackSavedCount(FeedbackService.getFeedbackCount());
      setFeedbackSubmitState('saved');
      setFeedbackSubmitMessage('Feedback saved locally for review/export.');
      setFeedbackMessage('');
      setFeedbackCategory('bug');
      setIncludeDiagnostics(true);
      setIncludeContext(true);

      ClientLoggerService.info('Feedback submitted.', {
        category: 'feedback',
        eventType: 'feedback.submitted',
        route: window.location.pathname || '/',
        screen: activeTab,
        contextIds: {
          orgId: org?.id,
          userId: user?.id,
        },
        metadata: {
          feedbackId: record.id,
          feedbackCategory,
          diagnosticsIncluded: includeDiagnostics,
          contextIncluded: includeContext,
        },
      });
    } catch (error) {
      setFeedbackSubmitState('failed');
      setFeedbackSubmitMessage('Saving feedback failed. Nothing was sent. Try again.');
      ClientLoggerService.error('Feedback submission failed.', {
        category: 'feedback',
        eventType: 'feedback.submit_failed',
        route: window.location.pathname || '/',
        screen: activeTab,
        contextIds: {
          orgId: org?.id,
          userId: user?.id,
        },
        metadata: {
          feedbackCategory,
          diagnosticsIncluded: includeDiagnostics,
          contextIncluded: includeContext,
          error,
        },
      });
    }
  };

  const handleExportFeedback = () => {
    FeedbackService.downloadFeedbackExport();
    ClientLoggerService.info('Feedback export triggered.', {
      category: 'feedback',
      eventType: 'feedback.export_triggered',
      route: window.location.pathname || '/',
      screen: activeTab,
      contextIds: {
        orgId: org?.id,
        userId: user?.id,
      },
      metadata: {
        savedCount: FeedbackService.getFeedbackCount(),
      },
    });
  };

  const handleSeedDemoData = async () => {
    if (isSeedingDemoData || !AuthPolicyService.canUseDeveloperTools(role, permissions) || !org || !user) return;

    setIsSeedingDemoData(true);
    console.log('[DevSeedTrigger] Starting demo data seed...', {
      orgId: org.id,
      userId: user.id,
    });

    try {
      await DevSeedService.seedDemoData(org.id, user.id);
      console.log('[DevSeedTrigger] Demo data seed completed. Reloading app...');
      window.location.reload();
    } catch (error) {
      console.error('[DevSeedTrigger] Demo data seed failed.', error);
      setIsSeedingDemoData(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsMobileMenuOpen(false);
  };

  const pageTitle = viewLabels[activeTab] || activeTab.replace(/-/g, ' ');

  if (mode === 'focused') {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="min-h-screen">
          <div className="mx-auto max-w-7xl px-3 pb-4 pt-[calc(4rem+env(safe-area-inset-top))] md:px-6 md:pb-6">{children}</div>
        </main>

        <FeedbackButton onClick={handleOpenFeedback} compactOnMobile />
        <FeedbackPanel
          isOpen={isFeedbackOpen}
          category={feedbackCategory}
          message={feedbackMessage}
          includeDiagnostics={includeDiagnostics}
          includeContext={includeContext}
          savedCount={feedbackSavedCount}
          submitState={feedbackSubmitState}
          submitMessage={feedbackSubmitMessage}
          onClose={handleCloseFeedback}
          onCategoryChange={setFeedbackCategory}
          onMessageChange={setFeedbackMessage}
          onIncludeDiagnosticsChange={setIncludeDiagnostics}
          onIncludeContextChange={setIncludeContext}
          onSubmit={handleSubmitFeedback}
          onExport={handleExportFeedback}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white shadow-md">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-lowes-blue font-bold text-white">
            UF
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">UnitFlip</div>
            <h1 className="truncate text-lg font-bold tracking-tight">{pageTitle}</h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-slate-800"
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`
        bg-slate-900 text-white w-64 flex-shrink-0
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 bg-lowes-blue rounded flex items-center justify-center text-white font-bold">
            UF
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">UnitFlip</h1>
            <p className="text-xs text-slate-400">Inspection Operations</p>
          </div>
        </div>
        
        <nav className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-80px)]">
          {canAccessView('dashboard') ? (
            <button
              onClick={() => handleTabClick('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'dashboard' 
                  ? 'bg-lowes-blue text-white' 
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Home size={20} />
              <span className="font-medium">Dashboard</span>
            </button>
          ) : null}
          
          {canAccessView('rooms') ? (
            <button
              onClick={() => handleTabClick('rooms')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'rooms' 
                  ? 'bg-lowes-blue text-white' 
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Package size={20} />
              <span className="font-medium">Unit Workspace</span>
            </button>
          ) : null}

          {canAccessView('products') ? (
            <>
              <div className="my-4 border-t border-slate-800"></div>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Catalog</p>

              <button
                onClick={() => handleTabClick('products')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'products' 
                    ? 'bg-lowes-blue text-white' 
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ShoppingBag size={20} />
                <span className="font-medium">All Products</span>
              </button>

              <button
                onClick={() => handleTabClick('repair-kits')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'repair-kits' 
                    ? 'bg-lowes-blue text-white' 
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Wrench size={20} />
                <span className="font-medium">Repair Kits</span>
              </button>
            </>
          ) : null}

          <div className="my-4 border-t border-slate-800"></div>
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Operations</p>

          {canAccessView('inspections') ? (
            <button
              onClick={() => handleTabClick('inspections')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'inspections' 
                  ? 'bg-lowes-blue text-white' 
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ClipboardList size={20} />
              <span className="font-medium">Inspection</span>
            </button>
          ) : null}

          {canAccessView('procurement') ? (
            <button
              onClick={() => handleTabClick('procurement')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'procurement' 
                  ? 'bg-lowes-blue text-white' 
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ShoppingCart size={20} />
              <span className="font-medium">Procurement</span>
            </button>
          ) : null}

          {canAccessView('unit-management') ? (
            <>
              <div className="my-4 border-t border-slate-800"></div>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Management</p>

              <button
                onClick={() => handleTabClick('unit-management')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === 'unit-management' 
                    ? 'bg-lowes-blue text-white' 
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Package size={20} />
                <span className="font-medium">Portfolio</span>
              </button>
            </>
          ) : null}

          {AuthPolicyService.canManageTemplates(role, permissions) ||
          AuthPolicyService.canAccessAdminSettings(role, permissions) ||
          AuthPolicyService.canUseDeveloperTools(role, permissions) ? (
            <>
              <div className="my-4 border-t border-slate-800"></div>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin</p>

              {AuthPolicyService.canManageTemplates(role, permissions) ? (
                <button
                  onClick={() => handleTabClick('templates')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'templates' 
                      ? 'bg-lowes-blue text-white' 
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Layers3 size={20} />
                  <span className="font-medium">Templates</span>
                </button>
              ) : null}

              {AuthPolicyService.canAccessAdminSettings(role, permissions) ? (
                <button
                  onClick={() => handleTabClick('admin')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'admin' || activeTab === 'feedback-management'
                      ? 'bg-lowes-blue text-white' 
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Shield size={20} />
                  <span className="font-medium">Retention & Settings</span>
                </button>
              ) : null}

              {AuthPolicyService.canUseDeveloperTools(role, permissions) ? (
                <div className="px-4">
                  <button
                    onClick={() => handleTabClick('feedback-management')}
                    className={`w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                      activeTab === 'feedback-management'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquareWarning size={18} />
                    <span className="font-medium">Feedback Management</span>
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="my-4 border-t border-slate-800"></div>
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Shell</p>

          <div className="px-4">
            <div className="grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => {
                  onModeChange?.('focused');
                  setIsMobileMenuOpen(false);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'focused' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Focused
              </button>
              <button
                type="button"
                onClick={() => {
                  onModeChange?.('full');
                  setIsMobileMenuOpen(false);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === 'full' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                Full
              </button>
            </div>
          </div>

          <div className="px-4">
            {!isOnline ? (
              <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-red-300">
                <WifiOff size={18} />
                <span className="font-medium">Offline</span>
              </div>
            ) : isSyncing ? (
              <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-blue-300">
                <RefreshCw size={18} className="animate-spin" />
                <span className="font-medium">Syncing</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerSyncNow();
                  setIsMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-green-300 transition-colors hover:bg-slate-800"
                title={lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Synced'}
              >
                <Wifi size={18} />
                <span className="font-medium">Synced</span>
              </button>
            )}
          </div>

          {AuthPolicyService.canUseDeveloperTools(role, permissions) ? (
            <div className="px-4">
              <button
                type="button"
                onClick={() => void handleSeedDemoData()}
                disabled={isSeedingDemoData || !org || !user}
                className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left text-amber-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                title="Developer-only demo portfolio seed trigger"
              >
                <RefreshCw size={18} className={isSeedingDemoData ? 'animate-spin' : ''} />
                <span className="font-medium">{isSeedingDemoData ? 'Seeding Demo Data...' : 'Seed Demo Data'}</span>
              </button>
            </div>
          ) : null}

          {user && org && role ? (
            <div className="px-4">
              <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{role}</div>
                <div className="mt-1 text-sm font-medium text-white">{user.name}</div>
                <div className="text-xs text-slate-400">{org.name}</div>
              </div>
            </div>
          ) : null}

          {user ? (
            <div className="px-4">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full rounded-lg px-4 py-3 text-left font-medium text-slate-300 transition-colors hover:bg-slate-800"
              >
                Switch Session
              </button>
            </div>
          ) : null}

          <div className="pt-8 px-4">
             <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
               <h3 className="text-sm font-semibold text-slate-200 mb-2">Pro Tip</h3>
               <p className="text-xs text-slate-400">
                 Associate Lowes SKUs with your products for faster re-ordering during flips.
               </p>
             </div>
          </div>
        </nav>
      </aside>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          {children}
        </div>
      </main>

      <FeedbackButton onClick={handleOpenFeedback} />
      <FeedbackPanel
        isOpen={isFeedbackOpen}
        category={feedbackCategory}
        message={feedbackMessage}
        includeDiagnostics={includeDiagnostics}
        includeContext={includeContext}
        savedCount={feedbackSavedCount}
        submitState={feedbackSubmitState}
        submitMessage={feedbackSubmitMessage}
        onClose={handleCloseFeedback}
        onCategoryChange={setFeedbackCategory}
        onMessageChange={setFeedbackMessage}
        onIncludeDiagnosticsChange={setIncludeDiagnostics}
        onIncludeContextChange={setIncludeContext}
        onSubmit={handleSubmitFeedback}
        onExport={handleExportFeedback}
      />
    </div>
  );
};
