import React, { createContext, useContext, useState, useCallback } from 'react';
import { CatalogItem, BundleRule, ListRef, ProductInstance, ProductStatus } from '../models/types';
import { BundleRuleService } from '../services/BundleRuleService';
import { CatalogService } from '../services/CatalogService';
import { BundleSuggestionsModal } from '../../components/BundleSuggestionsModal';
import { createId } from '../../services/storage';
import { ProductInstanceService } from '../services/ProductInstanceService';

interface CatalogContextType {
  addCatalogItemToList: (listRef: ListRef, catalogItemId: string, orgId: string) => Promise<void>;
}

const CatalogContext = createContext<CatalogContextType | null>(null);

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    triggerItem: CatalogItem | null;
    rule: BundleRule | null;
    listRef: ListRef | null;
    orgId: string | null;
    catalogItems: CatalogItem[];
  }>({
    isOpen: false,
    triggerItem: null,
    rule: null,
    listRef: null,
    orgId: null,
    catalogItems: [],
  });

  const addCatalogItemToList = useCallback(async (listRef: ListRef, catalogItemId: string, orgId: string) => {
    const catalogItems = await CatalogService.getItems(orgId);
    const triggerItem = catalogItems.find(i => i.id === catalogItemId);
    if (!triggerItem) return;

    // 1. Check for bundle rule
    const rule = await BundleRuleService.getRuleByTrigger(orgId, catalogItemId);

    if (rule && rule.enabled && rule.companions.length > 0) {
      // Show modal
      setModalState({
        isOpen: true,
        triggerItem,
        rule,
        listRef,
        orgId,
        catalogItems,
      });
    } else {
      // Just add the trigger item
      await createProductInstance(orgId, listRef, triggerItem, 1);
    }
  }, []);

  const createProductInstance = async (orgId: string, listRef: ListRef, item: CatalogItem, qty: number) => {
    const instance = await ProductInstanceService.addInstance(orgId, {
      listRef,
      catalogItemId: item.id,
      qty,
      unit: item.unit,
      status: ProductStatus.PLANNING,
    });

    console.log('Added product instance:', instance);
    
    // For now, we'll trigger a custom event that lists can listen to
    window.dispatchEvent(new CustomEvent('product-instance-added', { detail: instance }));
  };

  const handleConfirmBundle = async (selectedCompanions: { catalogItemId: string; qty: number }[]) => {
    const { triggerItem, listRef, orgId, catalogItems } = modalState;
    if (!triggerItem || !listRef || !orgId) return;

    // Add trigger
    await createProductInstance(orgId, listRef, triggerItem, 1);

    // Add companions
    for (const companion of selectedCompanions) {
      const item = catalogItems.find(i => i.id === companion.catalogItemId);
      if (item) {
        await createProductInstance(orgId, listRef, item, companion.qty);
      }
    }

    setModalState(prev => ({ ...prev, isOpen: false }));
    
    // Log audit event
    console.log('BUNDLE_APPLIED', { triggerId: triggerItem.id, companions: selectedCompanions });
  };

  return (
    <CatalogContext.Provider value={{ addCatalogItemToList }}>
      {children}
      {modalState.isOpen && modalState.triggerItem && modalState.rule && (
        <BundleSuggestionsModal
          isOpen={modalState.isOpen}
          onClose={() => {
            // If they close without confirming, we still add the trigger item
            if (modalState.orgId && modalState.listRef && modalState.triggerItem) {
              createProductInstance(modalState.orgId, modalState.listRef, modalState.triggerItem, 1);
            }
            setModalState(prev => ({ ...prev, isOpen: false }));
          }}
          onConfirm={handleConfirmBundle}
          triggerItem={modalState.triggerItem}
          rule={modalState.rule}
          catalogItems={modalState.catalogItems}
        />
      )}
    </CatalogContext.Provider>
  );
};

export const useCatalog = () => {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used within a CatalogProvider');
  return context;
};
