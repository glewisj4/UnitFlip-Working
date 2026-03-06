import React, { useState, useEffect } from 'react';

import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { RoomView } from './components/RoomView';
import { ChecklistMode } from './components/ChecklistMode';
import { ProductManager } from './components/ProductManager';
import { RepairKitManager } from './components/RepairKitManager';
import { ImportWizard } from './components/ImportWizard';

import { UnitList } from './components/UnitList';
import { InspectionList } from './components/InspectionList';
import { InspectionDetail } from './components/InspectionDetail';
import { ShareLinkViewer } from './components/ShareLinkViewer';
import { AdminRetentionPanel } from './components/AdminRetentionPanel';

import { CatalogProvider } from './core/hooks/useCatalog';
import { AppState, CatalogItem, Room, RepairTemplate } from './core/models/types';
import { getStoredData, saveData, createId } from './services/storage';

import { useDebouncedCallback } from './core/hooks/useDebouncedCallback';
import { AppContextProvider } from './core/hooks/useAppContext';
import { useAuditLogger } from './core/hooks/useAuditLogger';
import { SyncEngineProvider } from './core/hooks/useSyncEngine';

const getShareTokenFromLocation = (): string | null => {
  const pathname = window.location.pathname || '';
  if (!pathname.startsWith('/share/')) return null;

  // Remove "/share/" prefix
  let tokenPart = pathname.slice('/share/'.length);

  // Defensive cleanup: strip query/hash (shouldn't exist in pathname, but safe),
  // trim trailing slashes, and ignore empty.
  tokenPart = tokenPart.split('?')[0].split('#')[0].replace(/\/+$/, '');

  return tokenPart.length > 0 ? tokenPart : null;
};

const AppContent: React.FC = () => {
  // NOTE: This AppState is legacy/local-only for Rooms/Products/Templates.
  // Units/Inspections/Photos/Reports/ShareLinks live in their own services/stores.
  const [data, setData] = useState<AppState>({ rooms: [], products: [], repairTemplates: [], categories: [], bundleRules: [] });

  const [isLoaded, setIsLoaded] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Inspection Flow State
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);

  // Share Viewer State
  const [shareToken, setShareToken] = useState<string | null>(null);

  const { log } = useAuditLogger();

  // Load data on mount + detect share link
  useEffect(() => {
    const token = getShareTokenFromLocation();
    if (token) {
      setShareToken(token);
    }

    const loadData = async () => {
      const stored = await getStoredData();
      setData(stored);
      setIsLoaded(true);
    };

    loadData();
  }, []);

  // Create debounced save function
  const debouncedSave = useDebouncedCallback((newData: AppState) => {
    // Best-effort save; storage service handles its own errors/fallbacks.
    void saveData(newData);
  }, 400);

  // Save legacy AppState (rooms/products/templates) on change
  useEffect(() => {
    if (isLoaded) {
      debouncedSave(data);
    }
  }, [data, isLoaded, debouncedSave]);

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  // Flush pending saves on window close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      debouncedSave.flush();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [debouncedSave]);

  const handleRoomSelect = (roomId: string) => {
    setSelectedRoomId(roomId);
    setCurrentView('room-detail');
  };

  const handleViewCategory = (category: string) => {
    setActiveCategory(category);
    setCurrentView('products');
  };

  const handleAddRoom = () => {
    const name = prompt('Enter Room Name (e.g., Garage):');
    if (name) {
      const newRoom: Room = {
        id: createId(),
        name,
        icon: 'Box',
        description: 'Custom added area',
        budget: 0,
      };
      setData((prev) => ({ ...prev, rooms: [...prev.rooms, newRoom] }));
      log('ROOM_CREATED', { entityType: 'room', entityId: newRoom.id, message: `Created room: ${name}` });
    }
  };

  const handleUpdateRoom = (updatedRoom: Room) => {
    setData((prev) => ({
      ...prev,
      rooms: prev.rooms.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)),
    }));
    log('ROOM_UPDATED', {
      entityType: 'room',
      entityId: updatedRoom.id,
      message: `Updated room: ${updatedRoom.name}`,
    });
  };

  const handleAddProduct = (product: CatalogItem) => {
    setData((prev) => ({
      ...prev,
      products: [...prev.products, product],
    }));
    log('CATALOG_ITEM_CREATED', {
      entityType: 'catalog_item',
      entityId: product.id,
      message: `Added product: ${product.name}`,
    });
  };

  const handleUpdateProduct = (updatedProduct: CatalogItem) => {
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === updatedProduct.id ? updatedProduct : p)),
    }));
    log('CATALOG_ITEM_UPDATED', {
      entityType: 'catalog_item',
      entityId: updatedProduct.id,
      message: `Updated product: ${updatedProduct.name}`,
    });
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      setData((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== productId),
      }));
      log('CATALOG_ITEM_DELETED', { entityType: 'catalog_item', entityId: productId, message: 'Deleted product' });
    }
  };

  // Repair Kit Handlers
  const handleAddTemplate = (template: RepairTemplate) => {
    setData((prev) => ({
      ...prev,
      repairTemplates: [...prev.repairTemplates, template],
    }));
    log('TEMPLATE_CREATED', {
      entityType: 'template',
      entityId: template.id,
      message: `Created template: ${template.name}`,
    });
  };

  const handleUpdateTemplate = (updatedTemplate: RepairTemplate) => {
    setData((prev) => ({
      ...prev,
      repairTemplates: prev.repairTemplates.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)),
    }));
    log('TEMPLATE_UPDATED', {
      entityType: 'template',
      entityId: updatedTemplate.id,
      message: `Updated template: ${updatedTemplate.name}`,
    });
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Delete this repair kit?')) {
      setData((prev) => ({
        ...prev,
        repairTemplates: prev.repairTemplates.filter((t) => t.id !== id),
      }));
      log('TEMPLATE_DELETED', { entityType: 'template', entityId: id, message: 'Deleted template' });
    }
  };

  const renderContent = () => {
    if (currentView === 'checklist') {
      return <ChecklistMode rooms={data.rooms} products={data.products} onUpdateProduct={handleUpdateProduct} />;
    }

    if (currentView === 'import-wizard') {
      return (
        <ImportWizard rooms={data.rooms} onAddProduct={handleAddProduct} onBack={() => setCurrentView('products')} />
      );
    }

    if (currentView === 'products') {
      return (
        <ProductManager
          initialCategory={activeCategory}
          onImport={() => setCurrentView('import-wizard')}
        />
      );
    }

    if (currentView === 'repair-kits') {
      return (
        <RepairKitManager
          templates={data.repairTemplates}
          onAddTemplate={handleAddTemplate}
          onUpdateTemplate={handleUpdateTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      );
    }

    if (currentView === 'room-detail' && selectedRoomId) {
      const room = data.rooms.find((r) => r.id === selectedRoomId);
      if (room) {
        return (
          <RoomView
            room={room}
            products={data.products.filter((p) => p.roomId === room.id)}
            onBack={() => {
              setSelectedRoomId(null);
              setCurrentView('dashboard');
            }}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onUpdateRoom={handleUpdateRoom}
            onViewCategory={handleViewCategory}
          />
        );
      }
    }

    if (currentView === 'inspections') {
      if (selectedInspectionId) {
        return <InspectionDetail inspectionId={selectedInspectionId} onBack={() => setSelectedInspectionId(null)} />;
      }
      if (selectedUnitId) {
        return (
          <InspectionList
            unitId={selectedUnitId}
            onSelectInspection={setSelectedInspectionId}
            onBack={() => setSelectedUnitId(null)}
          />
        );
      }
      return <UnitList onSelectUnit={setSelectedUnitId} />;
    }
    
    if (currentView === 'admin') {
      return <AdminRetentionPanel />;
    }

    // Default to rooms/dashboard view logic
    return (
      <Dashboard 
        rooms={data.rooms} 
        products={data.products} 
        onSelectRoom={handleRoomSelect} 
        onAddRoom={handleAddRoom} 
        onViewInspections={() => setCurrentView('inspections')}
      />
    );
  };

  // If URL is a share link, show the public viewer regardless of currentView.
  if (shareToken) {
    return <ShareLinkViewer token={shareToken} />;
  }

  return (
    <Layout
      activeTab={currentView === 'room-detail' ? 'rooms' : currentView}
      onTabChange={(tab) => {
        setCurrentView(tab);
        setSelectedRoomId(null);

        // Reset inspection flow state when leaving inspections tab
        if (tab !== 'inspections') {
          setSelectedUnitId(null);
          setSelectedInspectionId(null);
        }

        if (tab === 'products') {
          setActiveCategory(null); // Reset category filter when manually clicking the tab
        }
      }}
    >
      {renderContent()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppContextProvider>
      <SyncEngineProvider>
        <CatalogProvider>
          <AppContent />
        </CatalogProvider>
      </SyncEngineProvider>
    </AppContextProvider>
  );
};

export default App;