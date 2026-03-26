import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ClipboardList,
  Home,
  Layers3,
  Loader2,
  MapPin,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { CatalogItem } from '../core/models/types';
import {
  ApplianceLogEntry,
  Inspection,
  KeyLogEntry,
  MaintenanceEntry,
  RoomMeasurement,
  Unit,
  WarrantyEntry,
  WindowSize,
} from '../core/models/inspections';
import { ChecklistTemplate, LayoutTemplate } from '../core/models/templates';

interface UnitRecordPanelProps {
  unit: Unit | null;
  inspections: Inspection[];
  layouts: LayoutTemplate[];
  checklistLookup: Record<string, ChecklistTemplate>;
  resolvedChecklistByLayoutId: Record<string, string | undefined>;
  catalogItems: CatalogItem[];
  onSaveUnit: (unit: Unit) => Promise<void> | void;
  onOpenInspectionQueue: (unitId: string) => void;
  onOpenInspection: (inspectionId: string) => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-lowes-blue';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100';
const APPLIANCE_TYPES: ApplianceLogEntry['type'][] = ['refrigerator', 'range', 'dishwasher', 'hvac'];

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const parseNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const renderMoney = (value?: number) => {
  if (value === undefined || value === null) return 'Cost not logged';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};
const defaultApplianceLogs = (): ApplianceLogEntry[] =>
  APPLIANCE_TYPES.map((type) => ({ type, brand: '', modelNumber: '', serialNumber: '', installationDate: '' }));

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

export const UnitRecordPanel: React.FC<UnitRecordPanelProps> = ({
  unit,
  inspections,
  layouts,
  checklistLookup,
  resolvedChecklistByLayoutId,
  catalogItems,
  onSaveUnit,
  onOpenInspectionQueue,
  onOpenInspection,
}) => {
  const [draft, setDraft] = useState<Unit | null>(unit);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(unit);
    setSelectedFavoriteId('');
    setSaveState('idle');
    setSaveMessage(null);
  }, [unit]);

  const availableFavorites = useMemo(
    () =>
      catalogItems
        .filter((item) => !(draft?.favoriteProductIds || []).includes(item.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalogItems, draft?.favoriteProductIds],
  );

  const favoriteProducts = useMemo(
    () =>
      (draft?.favoriteProductIds || [])
        .map((id) => catalogItems.find((item) => item.id === id))
        .filter((item): item is CatalogItem => Boolean(item)),
    [catalogItems, draft?.favoriteProductIds],
  );

  const selectedLayout = useMemo(
    () => layouts.find((layout) => layout.id === draft?.assignedLayoutTemplateId) || null,
    [draft?.assignedLayoutTemplateId, layouts],
  );

  const resolvedChecklist = selectedLayout
    ? checklistLookup[resolvedChecklistByLayoutId[selectedLayout.id] || ''] || null
    : null;

  const lifecycleSummary = useMemo(
    () => ({
      active: inspections.filter((inspection) => inspection.status !== 'completed').length,
      completed: inspections.filter((inspection) => inspection.status === 'completed').length,
      latest: inspections[0] || null,
      draft: inspections.filter((inspection) => inspection.status === 'draft').length,
      inProgress: inspections.filter((inspection) => inspection.status === 'in_progress').length,
    }),
    [inspections],
  );

  if (!unit || !draft) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
          <Home size={42} className="text-slate-300" />
          <h2 className="mt-4 text-xl font-semibold text-slate-900">Select a unit record</h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Browse a facility or building on the left to inspect unit details, review lifecycle status, manage
            templates, and define favorites.
          </p>
        </div>
      </section>
    );
  }

  const managementData = draft.managementData || {};
  const physicalDetails = managementData.physicalDetails || {};
  const applianceLogs =
    managementData.applianceLogs && managementData.applianceLogs.length > 0
      ? managementData.applianceLogs
      : defaultApplianceLogs();
  const maintenanceHistory = managementData.maintenanceHistory || [];
  const warrantyInfo = managementData.warrantyInfo || [];
  const keyLog = managementData.keyLog || [];
  const roomMeasurements = physicalDetails.roomMeasurements || [];
  const windowSizes = physicalDetails.windowSizes || [];
  const doorWidths = physicalDetails.doorWidthsIn || [];

  const updateDraft = (patch: Partial<Unit>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaveState('idle');
    setSaveMessage(null);
  };

  const updateManagementData = (patch: NonNullable<Unit['managementData']>) => updateDraft({ managementData: patch });
  const updatePhysicalDetails = (
    patch: Partial<NonNullable<NonNullable<Unit['managementData']>['physicalDetails']>>,
  ) => updateManagementData({ ...managementData, physicalDetails: { ...physicalDetails, ...patch } });

  const updateArrayItem = <T,>(items: T[], index: number, patch: Partial<T>) =>
    items.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));

  const updateRoomMeasurement = (index: number, patch: Partial<RoomMeasurement>) =>
    updatePhysicalDetails({ roomMeasurements: updateArrayItem(roomMeasurements, index, patch) });
  const updateWindowSize = (index: number, patch: Partial<WindowSize>) =>
    updatePhysicalDetails({ windowSizes: updateArrayItem(windowSizes, index, patch) });
  const updateApplianceLog = (index: number, patch: Partial<ApplianceLogEntry>) =>
    updateManagementData({ ...managementData, applianceLogs: updateArrayItem(applianceLogs, index, patch) });
  const updateMaintenanceHistory = (index: number, patch: Partial<MaintenanceEntry>) =>
    updateManagementData({ ...managementData, maintenanceHistory: updateArrayItem(maintenanceHistory, index, patch) });
  const updateWarrantyInfo = (index: number, patch: Partial<WarrantyEntry>) =>
    updateManagementData({ ...managementData, warrantyInfo: updateArrayItem(warrantyInfo, index, patch) });
  const updateKeyLog = (index: number, patch: Partial<KeyLogEntry>) =>
    updateManagementData({ ...managementData, keyLog: updateArrayItem(keyLog, index, patch) });

  const updateDoorWidth = (index: number, value: string) => {
    const next = [...doorWidths];
    next[index] = parseNumber(value) || 0;
    updatePhysicalDetails({ doorWidthsIn: next.filter((width) => width > 0) });
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setSaveState('failed');
      setSaveMessage('Unit name is required before saving.');
      return;
    }

    setSaveState('saving');
    setSaveMessage('Saving unit details...');

    try {
      await onSaveUnit({
        ...draft,
        favoriteProductIds: draft.favoriteProductIds || [],
        assignedLayoutTemplateId: draft.assignedLayoutTemplateId || null,
      });
      setSaveState('saved');
      setSaveMessage('Unit details saved locally.');
    } catch (error) {
      setSaveState('failed');
      setSaveMessage(error instanceof Error ? error.message : 'Saving unit details failed.');
    }
  };

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Unit Record</p>
            {draft.seedMarker?.isSeedData ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                Demo data
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">{draft.name || 'Untitled unit'}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Manage identity, specifications, utilities, maintenance references, templates, and lifecycle context
            here. Use Inspection for live capture.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onOpenInspectionQueue(draft.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-lowes-blue px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <ClipboardList size={16} />
            Open in Inspection
          </button>
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
          >
            {saveState === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
            {saveState === 'saving' ? 'Saving...' : 'Save Unit Details'}
          </button>
        </div>
      </div>

      {saveMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            saveState === 'failed'
              ? 'border-red-200 bg-red-50 text-red-700'
              : saveState === 'saved'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          {saveMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <Section title="Unit identity and location" icon={<MapPin size={16} className="text-slate-600" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <input className={inputClass} value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Unit name" />
              <input className={inputClass} value={draft.unitCode || ''} onChange={(event) => updateDraft({ unitCode: event.target.value })} placeholder="Unit code" />
              <input className={inputClass} value={draft.facilityName || ''} onChange={(event) => updateDraft({ facilityName: event.target.value })} placeholder="Facility" />
              <input className={inputClass} value={draft.buildingName || ''} onChange={(event) => updateDraft({ buildingName: event.target.value })} placeholder="Building" />
              <input className={`${inputClass} md:col-span-2`} value={draft.address1 || ''} onChange={(event) => updateDraft({ address1: event.target.value })} placeholder="Address 1" />
              <input className={`${inputClass} md:col-span-2`} value={draft.address2 || ''} onChange={(event) => updateDraft({ address2: event.target.value })} placeholder="Address 2" />
              <input className={inputClass} value={draft.city || ''} onChange={(event) => updateDraft({ city: event.target.value })} placeholder="City" />
              <input className={inputClass} value={draft.state || ''} onChange={(event) => updateDraft({ state: event.target.value })} placeholder="State" />
              <input className={inputClass} value={draft.zip || ''} onChange={(event) => updateDraft({ zip: event.target.value })} placeholder="Zip" />
            </div>
          </Section>

          <Section title="Unit specifications and physical details" icon={<Building2 size={16} className="text-slate-600" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="number" className={inputClass} value={physicalDetails.squareFootage ?? ''} onChange={(event) => updatePhysicalDetails({ squareFootage: parseNumber(event.target.value) })} placeholder="Square footage" />
              <input type="number" className={inputClass} value={physicalDetails.bedrooms ?? ''} onChange={(event) => updatePhysicalDetails({ bedrooms: parseNumber(event.target.value) })} placeholder="Bedrooms" />
              <input type="number" step="0.5" className={inputClass} value={physicalDetails.bathrooms ?? ''} onChange={(event) => updatePhysicalDetails({ bathrooms: parseNumber(event.target.value) })} placeholder="Bathrooms" />
              <input type="number" step="0.5" className={inputClass} value={physicalDetails.ceilingHeightFt ?? ''} onChange={(event) => updatePhysicalDetails({ ceilingHeightFt: parseNumber(event.target.value) })} placeholder="Ceiling height (ft)" />
              <textarea rows={3} className={`${inputClass} md:col-span-2 resize-none`} value={physicalDetails.floorPlanNotes || ''} onChange={(event) => updatePhysicalDetails({ floorPlanNotes: event.target.value })} placeholder="Floor plan notes" />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room measurements</div>
                  <button type="button" onClick={() => updatePhysicalDetails({ roomMeasurements: [...roomMeasurements, { roomName: '', widthFt: 0, lengthFt: 0 }] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {roomMeasurements.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No room measurements logged yet.</div>
                  ) : (
                    roomMeasurements.map((entry, index) => (
                      <div key={`room-${index}`} className="grid gap-2">
                        <div className="flex items-center gap-2">
                          <input className={inputClass} value={entry.roomName} onChange={(event) => updateRoomMeasurement(index, { roomName: event.target.value })} placeholder="Room name" />
                          <button type="button" onClick={() => updatePhysicalDetails({ roomMeasurements: roomMeasurements.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" className={inputClass} value={entry.widthFt ?? ''} onChange={(event) => updateRoomMeasurement(index, { widthFt: parseNumber(event.target.value) || 0 })} placeholder="Width (ft)" />
                          <input type="number" className={inputClass} value={entry.lengthFt ?? ''} onChange={(event) => updateRoomMeasurement(index, { lengthFt: parseNumber(event.target.value) || 0 })} placeholder="Length (ft)" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Window sizes</div>
                  <button type="button" onClick={() => updatePhysicalDetails({ windowSizes: [...windowSizes, { location: '', widthIn: 0, heightIn: 0 }] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {windowSizes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No window sizes logged yet.</div>
                  ) : (
                    windowSizes.map((entry, index) => (
                      <div key={`window-${index}`} className="grid gap-2">
                        <div className="flex items-center gap-2">
                          <input className={inputClass} value={entry.location} onChange={(event) => updateWindowSize(index, { location: event.target.value })} placeholder="Window location" />
                          <button type="button" onClick={() => updatePhysicalDetails({ windowSizes: windowSizes.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" className={inputClass} value={entry.widthIn ?? ''} onChange={(event) => updateWindowSize(index, { widthIn: parseNumber(event.target.value) || 0 })} placeholder='Width (")' />
                          <input type="number" className={inputClass} value={entry.heightIn ?? ''} onChange={(event) => updateWindowSize(index, { heightIn: parseNumber(event.target.value) || 0 })} placeholder='Height (")' />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Door widths</div>
                  <button type="button" onClick={() => updatePhysicalDetails({ doorWidthsIn: [...doorWidths, 0] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {doorWidths.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No door widths logged yet.</div>
                  ) : (
                    doorWidths.map((width, index) => (
                      <div key={`door-${index}`} className="flex items-center gap-2">
                        <input type="number" className={inputClass} value={width || ''} onChange={(event) => updateDoorWidth(index, event.target.value)} placeholder='Width (")' />
                        <button type="button" onClick={() => updatePhysicalDetails({ doorWidthsIn: doorWidths.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                          <X size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Appliance logs" icon={<Wrench size={16} className="text-slate-600" />}>
            <div className="space-y-3">
              {applianceLogs.map((entry, index) => (
                <div key={`${entry.type}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{titleCase(entry.type)}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className={inputClass} value={entry.brand || ''} onChange={(event) => updateApplianceLog(index, { brand: event.target.value })} placeholder="Brand" />
                    <input className={inputClass} value={entry.modelNumber || ''} onChange={(event) => updateApplianceLog(index, { modelNumber: event.target.value })} placeholder="Model number" />
                    <input className={inputClass} value={entry.serialNumber || ''} onChange={(event) => updateApplianceLog(index, { serialNumber: event.target.value })} placeholder="Serial number" />
                    <input type="date" className={inputClass} value={entry.installationDate || ''} onChange={(event) => updateApplianceLog(index, { installationDate: event.target.value })} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Paint codes and utility information" icon={<Sparkles size={16} className="text-slate-600" />}>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <input className={inputClass} value={managementData.paintCodes?.walls || ''} onChange={(event) => updateManagementData({ ...managementData, paintCodes: { ...managementData.paintCodes, walls: event.target.value } })} placeholder="Walls paint code" />
                <input className={inputClass} value={managementData.paintCodes?.trim || ''} onChange={(event) => updateManagementData({ ...managementData, paintCodes: { ...managementData.paintCodes, trim: event.target.value } })} placeholder="Trim paint code" />
                <input className={inputClass} value={managementData.paintCodes?.ceilings || ''} onChange={(event) => updateManagementData({ ...managementData, paintCodes: { ...managementData.paintCodes, ceilings: event.target.value } })} placeholder="Ceilings paint code" />
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <input className={inputClass} value={managementData.utilityInfo?.waterAccountNumber || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, waterAccountNumber: event.target.value } })} placeholder="Water account number" />
                <input className={inputClass} value={managementData.utilityInfo?.gasAccountNumber || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, gasAccountNumber: event.target.value } })} placeholder="Gas account number" />
                <input className={inputClass} value={managementData.utilityInfo?.electricAccountNumber || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, electricAccountNumber: event.target.value } })} placeholder="Electric account number" />
                <input className={inputClass} value={managementData.utilityInfo?.waterMeterLocation || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, waterMeterLocation: event.target.value } })} placeholder="Water meter location" />
                <input className={inputClass} value={managementData.utilityInfo?.gasMeterLocation || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, gasMeterLocation: event.target.value } })} placeholder="Gas meter location" />
                <input className={inputClass} value={managementData.utilityInfo?.electricMeterLocation || ''} onChange={(event) => updateManagementData({ ...managementData, utilityInfo: { ...managementData.utilityInfo, electricMeterLocation: event.target.value } })} placeholder="Electric meter location" />
              </div>
            </div>
          </Section>

          <Section title="Maintenance cheat sheet" icon={<Wrench size={16} className="text-slate-600" />}>
            <div className="grid gap-3 md:grid-cols-3">
              <input className={inputClass} value={managementData.maintenanceCheatSheet?.airFilterSize || ''} onChange={(event) => updateManagementData({ ...managementData, maintenanceCheatSheet: { ...managementData.maintenanceCheatSheet, airFilterSize: event.target.value } })} placeholder="Air filter size" />
              <input className={inputClass} value={managementData.maintenanceCheatSheet?.smokeDetectorBatteryType || ''} onChange={(event) => updateManagementData({ ...managementData, maintenanceCheatSheet: { ...managementData.maintenanceCheatSheet, smokeDetectorBatteryType: event.target.value } })} placeholder="Smoke detector battery type" />
              <input className={`${inputClass} md:col-span-3`} value={managementData.maintenanceCheatSheet?.mainWaterShutoffLocation || ''} onChange={(event) => updateManagementData({ ...managementData, maintenanceCheatSheet: { ...managementData.maintenanceCheatSheet, mainWaterShutoffLocation: event.target.value } })} placeholder="Main water shut-off location" />
            </div>
          </Section>

          <Section title="Move-in, move-out, and maintenance history" icon={<Sparkles size={16} className="text-slate-600" />}>
            <div className="grid gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-3">
                  <textarea rows={3} className={`${inputClass} resize-none`} value={managementData.moveHistory?.moveInChecklistSummary || ''} onChange={(event) => updateManagementData({ ...managementData, moveHistory: { ...managementData.moveHistory, moveInChecklistSummary: event.target.value } })} placeholder="Move-in summary" />
                  <textarea rows={3} className={`${inputClass} resize-none`} value={managementData.moveHistory?.moveOutChecklistSummary || ''} onChange={(event) => updateManagementData({ ...managementData, moveHistory: { ...managementData.moveHistory, moveOutChecklistSummary: event.target.value } })} placeholder="Move-out summary" />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work order trail</div>
                  <button type="button" onClick={() => updateManagementData({ ...managementData, maintenanceHistory: [...maintenanceHistory, { date: '', title: '', vendor: '', cost: undefined, notes: '' }] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {maintenanceHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No maintenance history recorded yet.</div>
                  ) : (
                    maintenanceHistory.map((entry, index) => (
                      <div key={`maintenance-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex justify-end">
                          <button type="button" onClick={() => updateManagementData({ ...managementData, maintenanceHistory: maintenanceHistory.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input type="date" className={inputClass} value={entry.date || ''} onChange={(event) => updateMaintenanceHistory(index, { date: event.target.value })} />
                          <input className={inputClass} value={entry.title || ''} onChange={(event) => updateMaintenanceHistory(index, { title: event.target.value })} placeholder="Work order title" />
                          <input className={inputClass} value={entry.vendor || ''} onChange={(event) => updateMaintenanceHistory(index, { vendor: event.target.value })} placeholder="Vendor" />
                          <input type="number" className={inputClass} value={entry.cost ?? ''} onChange={(event) => updateMaintenanceHistory(index, { cost: parseNumber(event.target.value) })} placeholder="Cost" />
                          <textarea rows={2} className={`${inputClass} md:col-span-2 resize-none`} value={entry.notes || ''} onChange={(event) => updateMaintenanceHistory(index, { notes: event.target.value })} placeholder="Work order notes" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Template assignment" icon={<Layers3 size={16} className="text-slate-600" />}>
            <div className="grid gap-3 lg:grid-cols-2">
              <select className={inputClass} value={draft.assignedLayoutTemplateId || ''} onChange={(event) => updateDraft({ assignedLayoutTemplateId: event.target.value || null })}>
                <option value="">No unit-specific assignment</option>
                {layouts.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.name}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                <div className="text-xs uppercase tracking-wide text-slate-500">Resolved checklist</div>
                <div className="mt-2 font-medium text-slate-900">{resolvedChecklist?.name || (selectedLayout ? 'Default checklist mapping unavailable' : 'Assign a layout template')}</div>
                <div className="mt-2 text-xs text-slate-500">Saved here so future inspections can start from a consistent unit baseline.</div>
              </div>
            </div>
          </Section>

          <Section title="Product favorites" icon={<Star size={16} className="text-slate-600" />}>
            <div className="flex flex-col gap-3 md:flex-row">
              <select className={inputClass} value={selectedFavoriteId} onChange={(event) => setSelectedFavoriteId(event.target.value)}>
                <option value="">Select a catalog item</option>
                {availableFavorites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.seedMarker?.isSeedData ? ' (Demo)' : ''}
                  </option>
                ))}
              </select>
              <button onClick={() => { if (!selectedFavoriteId) return; updateDraft({ favoriteProductIds: [...(draft.favoriteProductIds || []), selectedFavoriteId] }); setSelectedFavoriteId(''); }} disabled={!selectedFavoriteId} className={buttonClass}>
                <Plus size={16} />
                Add favorite
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {favoriteProducts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500">No unit-specific favorites yet.</div>
              ) : (
                favoriteProducts.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <span>{item.name}</span>
                    {item.seedMarker?.isSeedData ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Demo</span> : null}
                    <button onClick={() => updateDraft({ favoriteProductIds: (draft.favoriteProductIds || []).filter((favoriteId) => favoriteId !== item.id) })} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Remove ${item.name}`}>
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Management notes" icon={<Sparkles size={16} className="text-slate-600" />}>
            <textarea rows={4} className={`${inputClass} resize-none`} value={draft.notes || ''} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Use this for unit setup notes, access details, standards, or lifecycle guidance." />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Inspection lifecycle" icon={<Wrench size={16} className="text-slate-600" />}>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Active</div><div className="mt-1 text-2xl font-bold text-slate-900">{lifecycleSummary.active}</div></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Completed</div><div className="mt-1 text-2xl font-bold text-slate-900">{lifecycleSummary.completed}</div></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs uppercase tracking-wide text-slate-500">Ready</div><div className="mt-1 text-2xl font-bold text-amber-700">{lifecycleSummary.draft}</div></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs uppercase tracking-wide text-slate-500">In progress</div><div className="mt-1 text-2xl font-bold text-sky-700">{lifecycleSummary.inProgress}</div></div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <div className="text-xs uppercase tracking-wide text-slate-500">Latest inspection</div>
              <div className="mt-2 font-medium text-slate-900">{lifecycleSummary.latest?.title || 'No inspections yet'}</div>
              <div className="mt-1">
                {lifecycleSummary.latest
                  ? `${titleCase(lifecycleSummary.latest.status)} • Updated ${new Date(lifecycleSummary.latest.updatedAt).toLocaleString()}`
                  : 'Use Inspection to create the first inspection record for this unit.'}
              </div>
            </div>
          </Section>

          <Section title="Recent inspections" icon={<ClipboardList size={16} className="text-slate-600" />}>
            <div className="space-y-3">
              {inspections.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">No inspections recorded for this unit yet.</div>
              ) : (
                inspections.slice(0, 5).map((inspection) => (
                  <div key={inspection.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium text-slate-900">{inspection.title}</div>
                          {inspection.seedMarker?.isSeedData ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Demo</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{titleCase(inspection.status)} • Updated {new Date(inspection.updatedAt).toLocaleString()}</div>
                      </div>
                      <button onClick={() => onOpenInspection(inspection.id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100">
                        {inspection.status === 'completed' ? 'Review in Inspection' : 'Resume in Inspection'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Warranty and key log" icon={<Sparkles size={16} className="text-slate-600" />}>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warranty tracking</div>
                  <button type="button" onClick={() => updateManagementData({ ...managementData, warrantyInfo: [...warrantyInfo, { item: '', provider: '', warrantyEndsOn: '', notes: '' }] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {warrantyInfo.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No warranty records logged yet.</div>
                  ) : (
                    warrantyInfo.map((entry, index) => (
                      <div key={`warranty-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex justify-end">
                          <button type="button" onClick={() => updateManagementData({ ...managementData, warrantyInfo: warrantyInfo.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid gap-3">
                          <input className={inputClass} value={entry.item || ''} onChange={(event) => updateWarrantyInfo(index, { item: event.target.value })} placeholder="Covered item" />
                          <input className={inputClass} value={entry.provider || ''} onChange={(event) => updateWarrantyInfo(index, { provider: event.target.value })} placeholder="Provider" />
                          <input type="date" className={inputClass} value={entry.warrantyEndsOn || ''} onChange={(event) => updateWarrantyInfo(index, { warrantyEndsOn: event.target.value })} />
                          <textarea rows={2} className={`${inputClass} resize-none`} value={entry.notes || ''} onChange={(event) => updateWarrantyInfo(index, { notes: event.target.value })} placeholder="Warranty notes" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key log tracking</div>
                  <button type="button" onClick={() => updateManagementData({ ...managementData, keyLog: [...keyLog, { holder: '', role: '', keyCount: undefined, notes: '' }] })} className={buttonClass}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {keyLog.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">No key log recorded yet.</div>
                  ) : (
                    keyLog.map((entry, index) => (
                      <div key={`keylog-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex justify-end">
                          <button type="button" onClick={() => updateManagementData({ ...managementData, keyLog: keyLog.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="grid gap-3">
                          <input className={inputClass} value={entry.holder || ''} onChange={(event) => updateKeyLog(index, { holder: event.target.value })} placeholder="Holder" />
                          <input className={inputClass} value={entry.role || ''} onChange={(event) => updateKeyLog(index, { role: event.target.value })} placeholder="Role" />
                          <input type="number" className={inputClass} value={entry.keyCount ?? ''} onChange={(event) => updateKeyLog(index, { keyCount: parseNumber(event.target.value) })} placeholder="Key count" />
                          <textarea rows={2} className={`${inputClass} resize-none`} value={entry.notes || ''} onChange={(event) => updateKeyLog(index, { notes: event.target.value })} placeholder="Key notes" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Structural context" icon={<Building2 size={16} className="text-slate-600" />}>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Facility / Building</div>
                <div className="mt-2 font-medium text-slate-900">{[draft.facilityName || 'Unassigned facility', draft.buildingName || 'Unassigned building'].join(' / ')}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Setup responsibility</div>
                <div className="mt-2">This panel is the home for unit setup, defaults, maintenance references, and lifecycle review.</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Future inspection standardization</div>
                <div className="mt-2">Assigned templates, maintenance cheat-sheet data, and favorites saved here are ready to inform the next inspection setup flow.</div>
              </div>
              {maintenanceHistory.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Most recent work order</div>
                  <div className="mt-2 font-medium text-slate-900">{maintenanceHistory[0]?.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{[maintenanceHistory[0]?.date, maintenanceHistory[0]?.vendor, renderMoney(maintenanceHistory[0]?.cost)].filter(Boolean).join(' • ')}</div>
                  <div className="mt-2 text-sm text-slate-600">{maintenanceHistory[0]?.notes || 'No notes recorded.'}</div>
                </div>
              ) : null}
            </div>
          </Section>
        </div>
      </div>
    </section>
  );
};
