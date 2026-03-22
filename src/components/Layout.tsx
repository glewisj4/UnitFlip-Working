import React, { useState } from 'react';
import { Home, Package, ShoppingBag, Wrench, Menu, X, ClipboardList, RefreshCw, Wifi, WifiOff, Shield, Layers3, ShoppingCart, MessageSquareWarning } from 'lucide-react';
import { useSyncEngine } from '../core/hooks/useSyncEngine';
import { useAppContext } from '../core/hooks/useAppContext';
import { ClientLoggerService } from '../core/services/ClientLoggerService';
import { FeedbackCategory, FeedbackService } from '../core/services/FeedbackService';
import { FeedbackButton } from './FeedbackButton';
import { FeedbackPanel } from './FeedbackPanel';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [includeContext, setIncludeContext] = useState(true);
  const [feedbackSavedCount, setFeedbackSavedCount] = useState(() => FeedbackService.getFeedbackCount());
  const [feedbackSubmitState, setFeedbackSubmitState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [feedbackSubmitMessage, setFeedbackSubmitMessage] = useState<string | undefined>(undefined);
  const { isOnline, isSyncing, lastSyncAt, triggerSyncNow } = useSyncEngine();
  const { org, user, role } = useAppContext();
  const viewLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    rooms: 'Room Manager',
    products: 'All Products',
    'repair-kits': 'Repair Kits',
    checklist: 'Checklist',
    inspections: 'Inspection',
    'unit-management': 'Unit Management',
    procurement: 'Procurement',
    templates: 'Templates',
    admin: 'Retention & Settings',
    'feedback-management': 'Feedback Management',
  };

  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    setIsMobileMenuOpen(false);
  };

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative">
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-lowes-blue rounded flex items-center justify-center text-white font-bold">
            UF
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">UnitFlip</h1>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        bg-slate-900 text-white w-64 flex-shrink-0
        fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
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
          
          <button
            onClick={() => handleTabClick('rooms')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === 'rooms' 
                ? 'bg-lowes-blue text-white' 
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Package size={20} />
            <span className="font-medium">Room Manager</span>
          </button>

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

          <div className="my-4 border-t border-slate-800"></div>
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Operations</p>

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
            <span className="font-medium">Unit Management</span>
          </button>

          <div className="my-4 border-t border-slate-800"></div>
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin</p>

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

          {role === 'developer' ? (
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
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto h-[calc(100vh-64px)] md:h-screen">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-800 capitalize">
            {viewLabels[activeTab] || activeTab.replace(/-/g, ' ')}
          </h2>
          <div className="flex items-center gap-4">
            {/* Sync Status Badge */}
            <div className="flex items-center gap-2 text-sm">
                {!isOnline ? (
                    <span className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-1 rounded-full border border-red-100">
                        <WifiOff size={14} />
                        Offline
                    </span>
                ) : isSyncing ? (
                    <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                        <RefreshCw size={14} className="animate-spin" />
                        Syncing...
                    </span>
                ) : (
                    <button 
                        onClick={triggerSyncNow}
                        className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100 hover:bg-green-100 transition-colors"
                        title={lastSyncAt ? `Last synced ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Synced'}
                    >
                        <Wifi size={14} />
                        Synced
                    </button>
                )}
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
              Database Active
            </span>
          </div>
        </header>
        
        <div className="p-6 max-w-7xl mx-auto">
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
