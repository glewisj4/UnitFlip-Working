import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Copy,
  Layers3,
  Link2,
  Loader2,
  Plus,
  Settings2,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useAppContext } from '../core/hooks/useAppContext';
import {
  ChecklistScopedOverride,
  ChecklistTemplate,
  LayoutChecklistMapping,
  LayoutTemplate,
} from '../core/models/templates';
import { Unit } from '../core/models/inspections';
import { ChecklistScopedOverrideService } from '../core/services/ChecklistScopedOverrideService';
import { ChecklistTemplateService } from '../core/services/ChecklistTemplateService';
import { AuthPolicyService } from '../core/services/AuthPolicyService';
import { LayoutChecklistMappingService } from '../core/services/LayoutChecklistMappingService';
import { LayoutTemplateService } from '../core/services/LayoutTemplateService';
import { UnitService } from '../core/services/UnitService';
import { ChecklistTemplateEditorModal } from './ChecklistTemplateEditorModal';
import { ChecklistScopedOverrideEditorModal } from './ChecklistScopedOverrideEditorModal';
import { LayoutTemplateEditorModal } from './LayoutTemplateEditorModal';
import { MappingEditorModal } from './MappingEditorModal';

type TemplateTab = 'layouts' | 'checklists' | 'mappings' | 'overrides';

const badgeClass = (kind: 'system' | 'custom' | 'archived' | 'active') => {
  switch (kind) {
    case 'system':
      return 'bg-slate-100 text-slate-600';
    case 'custom':
      return 'bg-emerald-100 text-emerald-700';
    case 'archived':
      return 'bg-amber-100 text-amber-700';
    case 'active':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export const TemplateManager: React.FC = () => {
  const { org, role, permissions } = useAppContext();
  const [activeTab, setActiveTab] = useState<TemplateTab>('layouts');
  const [layouts, setLayouts] = useState<LayoutTemplate[]>([]);
  const [checklists, setChecklists] = useState<ChecklistTemplate[]>([]);
  const [mappings, setMappings] = useState<LayoutChecklistMapping[]>([]);
  const [overrides, setOverrides] = useState<ChecklistScopedOverride[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [layoutEditorState, setLayoutEditorState] = useState<{
    open: boolean;
    mode: 'create' | 'edit' | 'customize';
    template: LayoutTemplate | null;
  }>({ open: false, mode: 'create', template: null });

  const [checklistEditorState, setChecklistEditorState] = useState<{
    open: boolean;
    mode: 'create' | 'edit' | 'customize';
    template: ChecklistTemplate | null;
  }>({ open: false, mode: 'create', template: null });

  const [mappingEditorState, setMappingEditorState] = useState<{
    open: boolean;
    mode: 'create' | 'edit' | 'customize';
    mapping: LayoutChecklistMapping | null;
  }>({ open: false, mode: 'create', mapping: null });

  const [overrideEditorState, setOverrideEditorState] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    override: ChecklistScopedOverride | null;
  }>({ open: false, mode: 'create', override: null });

  const canAccessTemplates = AuthPolicyService.canManageTemplates(role, permissions);
  const canManageTemplates = AuthPolicyService.canManageTemplates(role, permissions);
  const canManageOverrides = AuthPolicyService.canManageTemplates(role, permissions);
  const tabMeta: Record<TemplateTab, { label: string; description: string; count: number }> = {
    layouts: {
      label: 'Layout Templates',
      description: 'Controls room structure and inspection entry points.',
      count: layouts.length,
    },
    checklists: {
      label: 'Checklist Templates',
      description: 'Defines the inspection items and always-replace standards.',
      count: checklists.length,
    },
    mappings: {
      label: 'Template Mappings',
      description: 'Connects layouts to their checklist definitions.',
      count: mappings.length,
    },
    overrides: {
      label: 'Scoped Overrides',
      description: 'Applies deterministic org, property, or unit behavior after presets.',
      count: overrides.length,
    },
  };

  const loadData = async () => {
    if (!org) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [loadedLayouts, loadedChecklists, loadedMappings, loadedOverrides, loadedUnits] = await Promise.all([
        LayoutTemplateService.listAll(org.id),
        ChecklistTemplateService.listAll(org.id),
        LayoutChecklistMappingService.listAll(org.id),
        ChecklistScopedOverrideService.listAll(org.id),
        UnitService.listUnits(org.id),
      ]);
      setLayouts(loadedLayouts);
      setChecklists(loadedChecklists);
      setMappings(loadedMappings);
      setOverrides(loadedOverrides);
      setUnits(loadedUnits);
    } catch (error) {
      console.error(error);
      setErrorMessage('Failed to load template management data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (org) {
      void loadData();
    }
  }, [org?.id]);

  const layoutLookup = useMemo(
    () => Object.fromEntries(layouts.map((layout) => [layout.id, layout])),
    [layouts]
  );
  const checklistLookup = useMemo(
    () => Object.fromEntries(checklists.map((checklist) => [checklist.id, checklist])),
    [checklists]
  );
  const checklistItemLookup = useMemo(
    () =>
      Object.fromEntries(
        checklists.flatMap((checklist) =>
          checklist.recipeSections.flatMap((section) =>
            section.items.map((item) => [
              item.id,
              {
                checklistName: checklist.name,
                sectionTitle: section.title,
                itemLabel: item.label,
              },
            ])
          )
        )
      ),
    [checklists]
  );

  if (!org) return null;

  if (!canAccessTemplates) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Layers3 size={40} className="mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Template Management</h2>
        <p className="text-slate-500 mt-2">Admin or developer access is required to view template settings.</p>
      </div>
    );
  }

  const handleArchiveLayout = async (template: LayoutTemplate) => {
    if (!confirm(`Archive "${template.name}"?`)) return;
    try {
      await LayoutTemplateService.archive(template.id, org.id);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to archive layout template.');
    }
  };

  const handleArchiveChecklist = async (template: ChecklistTemplate) => {
    if (!confirm(`Archive "${template.name}"?`)) return;
    try {
      await ChecklistTemplateService.archive(template.id, org.id);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to archive checklist template.');
    }
  };

  const handleArchiveMapping = async (mapping: LayoutChecklistMapping) => {
    if (!confirm('Archive this mapping?')) return;
    try {
      await LayoutChecklistMappingService.archive(mapping.id, org.id);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to archive mapping.');
    }
  };

  const handleDeleteOverride = async (overrideRecord: ChecklistScopedOverride) => {
    if (!confirm('Delete this scoped override?')) return;
    try {
      await ChecklistScopedOverrideService.delete(overrideRecord.id, org.id);
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete scoped override.');
    }
  };

  const renderScopeTarget = (overrideRecord: ChecklistScopedOverride) => {
    if (overrideRecord.scopeType === 'organization') {
      return org.name;
    }
    if (overrideRecord.scopeType === 'property') {
      return overrideRecord.scopeRefId;
    }
    return units.find((unit) => unit.id === overrideRecord.scopeRefId)?.name || overrideRecord.scopeRefId;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Template Management</h1>
          <p className="text-slate-500">Manage system defaults, custom templates, and layout mappings.</p>
        </div>
        <button
          onClick={() => void loadData()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Access mode</div>
            <div className="mt-1 text-base font-semibold text-slate-900">
              {canManageTemplates || canManageOverrides ? 'Manage templates and overrides' : 'Read-only template view'}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {canManageTemplates
                ? 'You can create and edit layouts, checklists, and mappings.'
                : 'Template definitions are visible for review only.'}{' '}
              {canManageOverrides
                ? 'You can also create and edit scoped overrides.'
                : 'Scoped overrides are visible but not editable for your role.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{layouts.length} layouts</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{checklists.length} checklists</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{mappings.length} mappings</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{overrides.length} overrides</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 flex flex-wrap gap-2">
        {[
          { id: 'layouts', label: 'Layout Templates', icon: Layers3 },
          { id: 'checklists', label: 'Checklist Templates', icon: ClipboardList },
          { id: 'mappings', label: 'Template Mappings', icon: Link2 },
          { id: 'overrides', label: 'Scoped Overrides', icon: Settings2 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TemplateTab)}
              className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
                activeTab === tab.id ? 'bg-lowes-blue text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {tabMeta[tab.id as TemplateTab].count}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoading && !errorMessage ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{tabMeta[activeTab].label}</div>
          <div className="mt-1 text-sm text-slate-600">{tabMeta[activeTab].description}</div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center">
          <Loader2 className="animate-spin text-lowes-blue" size={28} />
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {!isLoading && !errorMessage && activeTab === 'layouts' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canManageTemplates ? (
              <button
                onClick={() => setLayoutEditorState({ open: true, mode: 'create', template: null })}
                className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                New Layout Template
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Read-only for your role
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {layouts.map((layout) => (
              <div key={layout.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-slate-800">{layout.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(layout.isSystem ? 'system' : 'custom')}`}>
                        {layout.isSystem ? 'System' : 'Custom'}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(layout.isActive ? 'active' : 'archived')}`}>
                        {layout.isActive ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      {layout.bedrooms} bedrooms, {layout.bathroomsFull + layout.bathroomsHalf * 0.5} bathrooms
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      {layout.roomBlueprint.map((room) => room.label).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageTemplates ? (
                      <button
                        onClick={() => setLayoutEditorState({ open: true, mode: 'customize', template: layout })}
                        className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                        title="Duplicate / Customize"
                      >
                        <Copy size={16} />
                      </button>
                    ) : null}
                    {!layout.isSystem && canManageTemplates ? (
                      <>
                        <button
                          onClick={() => setLayoutEditorState({ open: true, mode: 'edit', template: layout })}
                          className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                          title="Edit"
                        >
                          <SquarePen size={16} />
                        </button>
                        <button
                          onClick={() => void handleArchiveLayout(layout)}
                          className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          title="Archive"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && activeTab === 'checklists' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canManageTemplates ? (
              <button
                onClick={() => setChecklistEditorState({ open: true, mode: 'create', template: null })}
                className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                New Checklist Template
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Read-only for your role
              </div>
            )}
          </div>
          <div className="space-y-4">
            {checklists.map((checklist) => (
              <div key={checklist.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-slate-800">{checklist.name}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(checklist.isSystem ? 'system' : 'custom')}`}>
                        {checklist.isSystem ? 'System' : 'Custom'}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(checklist.isActive ? 'active' : 'archived')}`}>
                        {checklist.isActive ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      {checklist.recipeSections.length} sections
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      {checklist.recipeSections.map((section) => section.title).join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageTemplates ? (
                      <button
                        onClick={() => setChecklistEditorState({ open: true, mode: 'customize', template: checklist })}
                        className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                        title="Duplicate / Customize"
                      >
                        <Copy size={16} />
                      </button>
                    ) : null}
                    {!checklist.isSystem && canManageTemplates ? (
                      <>
                        <button
                          onClick={() => setChecklistEditorState({ open: true, mode: 'edit', template: checklist })}
                          className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                          title="Edit"
                        >
                          <SquarePen size={16} />
                        </button>
                        <button
                          onClick={() => void handleArchiveChecklist(checklist)}
                          className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          title="Archive"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && activeTab === 'mappings' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canManageTemplates ? (
              <button
                onClick={() => setMappingEditorState({ open: true, mode: 'create', mapping: null })}
                className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                New Mapping
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Read-only for your role
              </div>
            )}
          </div>
          <div className="space-y-4">
            {mappings.map((mapping) => {
              const layout = layoutLookup[mapping.layoutTemplateId];
              const checklist = checklistLookup[mapping.checklistTemplateId];
              const isSystemMapping = mapping.orgId === null;
              return (
                <div key={mapping.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-slate-800">
                          {layout?.name || 'Missing layout'} → {checklist?.name || 'Missing checklist'}
                        </h3>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(isSystemMapping ? 'system' : 'custom')}`}>
                          {isSystemMapping ? 'System Default' : 'Custom'}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(mapping.isActive ? 'active' : 'archived')}`}>
                          {mapping.isActive ? 'Active' : 'Archived'}
                        </span>
                        {mapping.isDefault ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-slate-500 mt-2">
                        Layout: {layout?.name || 'Unavailable'} | Checklist: {checklist?.name || 'Unavailable'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManageTemplates ? (
                        <button
                          onClick={() => setMappingEditorState({ open: true, mode: isSystemMapping ? 'customize' : 'edit', mapping })}
                          className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                          title={isSystemMapping ? 'Customize' : 'Edit'}
                        >
                          {isSystemMapping ? <Copy size={16} /> : <SquarePen size={16} />}
                        </button>
                      ) : null}
                      {!isSystemMapping && canManageTemplates ? (
                        <button
                          onClick={() => void handleArchiveMapping(mapping)}
                          className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          title="Archive"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && activeTab === 'overrides' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">Scoped override precedence</div>
              <div className="mt-1 text-sm text-slate-500">
                Resolve checklist behavior in deterministic scope order: unit, property, then organization.
              </div>
            </div>
            {canManageOverrides ? (
              <button
                onClick={() => setOverrideEditorState({ open: true, mode: 'create', override: null })}
                className="rounded-lg bg-lowes-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={16} />
                New Scoped Override
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
                Read-only for your role
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">Organization</div>
              <div className="mt-1 text-sm text-amber-900">Baseline policy for all units when no narrower override exists.</div>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-800">Property</div>
              <div className="mt-1 text-sm text-blue-900">Overrides building-level standards like blinds or finish expectations.</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-800">Unit</div>
              <div className="mt-1 text-sm text-emerald-900">Highest priority. Use for known one-off unit standards.</div>
            </div>
          </div>
          <div className="space-y-4">
            {overrides.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No scoped overrides configured. Preset and template defaults will apply as-is.
              </div>
            ) : (
              overrides.map((overrideRecord) => {
                const item = checklistItemLookup[overrideRecord.templateItemId];
                return (
                  <div key={overrideRecord.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-slate-800">
                            {item?.itemLabel || overrideRecord.templateItemId}
                          </h3>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            {overrideRecord.scopeType}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            {renderScopeTarget(overrideRecord)}
                          </span>
                        </div>
                        <div className="text-sm text-slate-500">
                          {item ? `${item.checklistName} • ${item.sectionTitle}` : 'Checklist item unavailable'}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                          {overrideRecord.actionMode ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                              Action: {overrideRecord.actionMode}
                            </span>
                          ) : null}
                          {overrideRecord.preferredReplaceOption ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">
                              Replace: {overrideRecord.preferredReplaceOption}
                            </span>
                          ) : null}
                          {overrideRecord.preferredProductTier ? (
                            <span className="rounded-full bg-indigo-100 px-2 py-1 font-medium text-indigo-700">
                              Tier: {overrideRecord.preferredProductTier}
                            </span>
                          ) : null}
                        </div>
                        {overrideRecord.notes ? (
                          <p className="text-sm text-slate-500">{overrideRecord.notes}</p>
                        ) : null}
                      </div>
                      {canManageOverrides ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setOverrideEditorState({ open: true, mode: 'edit', override: overrideRecord })}
                            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                            title="Edit"
                          >
                            <SquarePen size={16} />
                          </button>
                          <button
                            onClick={() => void handleDeleteOverride(overrideRecord)}
                            className="p-2 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <LayoutTemplateEditorModal
        isOpen={layoutEditorState.open}
        orgId={org.id}
        checklistTemplates={checklists}
        template={layoutEditorState.template}
        mode={layoutEditorState.mode}
        onClose={() => setLayoutEditorState((prev) => ({ ...prev, open: false }))}
        onSaved={() => void loadData()}
      />

      <ChecklistTemplateEditorModal
        isOpen={checklistEditorState.open}
        orgId={org.id}
        template={checklistEditorState.template}
        mode={checklistEditorState.mode}
        onClose={() => setChecklistEditorState((prev) => ({ ...prev, open: false }))}
        onSaved={() => void loadData()}
      />

      <MappingEditorModal
        isOpen={mappingEditorState.open}
        orgId={org.id}
        layouts={layouts}
        checklists={checklists}
        mapping={mappingEditorState.mapping}
        mode={mappingEditorState.mode}
        onClose={() => setMappingEditorState((prev) => ({ ...prev, open: false }))}
        onSaved={() => void loadData()}
      />

      <ChecklistScopedOverrideEditorModal
        isOpen={overrideEditorState.open}
        organizationId={org.id}
        organizationLabel={org.name}
        units={units}
        checklists={checklists}
        override={overrideEditorState.override}
        mode={overrideEditorState.mode}
        onClose={() => setOverrideEditorState((prev) => ({ ...prev, open: false }))}
        onSaved={() => void loadData()}
      />
    </div>
  );
};
