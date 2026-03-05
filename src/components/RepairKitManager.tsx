import React, { useState } from 'react';
import { RepairTemplate, Tier, TemplateItem } from '../core/models/types';
import { Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { createId } from '../services/storage';

interface RepairKitManagerProps {
  templates: RepairTemplate[];
  onUpdateTemplate: (template: RepairTemplate) => void;
  onAddTemplate: (template: RepairTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

export const RepairKitManager: React.FC<RepairKitManagerProps> = ({
  templates,
  onUpdateTemplate,
  onAddTemplate,
  onDeleteTemplate
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');

  const handleCreateTemplate = () => {
    if (!newTemplateName) return;
    const newTemplate: RepairTemplate = {
        id: createId(),
        name: newTemplateName,
        description: newTemplateDesc,
        items: []
    };
    onAddTemplate(newTemplate);
    setIsCreating(false);
    setNewTemplateName('');
    setNewTemplateDesc('');
    setExpandedId(newTemplate.id);
  };

  const handleAddItem = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    const newItem: TemplateItem = {
        id: createId(),
        name: 'New Item',
        description: 'Item Description',
        defaultPrice: 0,
        tier: Tier.STANDARD
    };

    onUpdateTemplate({
        ...template,
        items: [...template.items, newItem]
    });
  };

  const handleUpdateItem = (templateId: string, updatedItem: TemplateItem) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    onUpdateTemplate({
        ...template,
        items: template.items.map(i => i.id === updatedItem.id ? updatedItem : i)
    });
  };

  const handleDeleteItem = (templateId: string, itemId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    onUpdateTemplate({
        ...template,
        items: template.items.filter(i => i.id !== itemId)
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-xl font-bold text-slate-800">Repair Kits</h2>
            <p className="text-slate-500">Manage templates for common repair jobs.</p>
        </div>
        <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-lowes-blue text-white rounded-lg hover:bg-lowes-hover shadow-sm"
        >
            <Plus size={18} /> Create New Kit
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-lg mb-6 animate-in fade-in slide-in-from-top-4">
            <h3 className="font-bold text-slate-800 mb-4">New Repair Kit</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Kit Name</label>
                    <input 
                        type="text" 
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="e.g., Roof Repair"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                    <input 
                        type="text" 
                        value={newTemplateDesc}
                        onChange={(e) => setNewTemplateDesc(e.target.value)}
                        placeholder="Briefly describe what this kit covers"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-lowes-blue"
                    />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                    <button onClick={handleCreateTemplate} className="px-4 py-2 bg-lowes-blue text-white rounded-lg hover:bg-lowes-hover">Create Kit</button>
                </div>
            </div>
        </div>
      )}

      <div className="space-y-4">
        {templates.map(template => {
            const isExpanded = expandedId === template.id;

            return (
                <div key={template.id} className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-lowes-blue ring-1 ring-lowes-blue shadow-md' : 'border-slate-200 shadow-sm'}`}>
                    <div 
                        className="p-4 flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : template.id)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isExpanded ? 'bg-blue-50 text-lowes-blue' : 'bg-slate-100 text-slate-500'}`}>
                                <Wrench size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">{template.name}</h3>
                                <p className="text-sm text-slate-500">{template.description} • {template.items.length} items</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Included Items</h4>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteTemplate(template.id); }}
                                        className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                                    >
                                        Delete Kit
                                    </button>
                                    <button 
                                        onClick={() => handleAddItem(template.id)}
                                        className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm"
                                    >
                                        <Plus size={14} /> Add Item
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {template.items.map(item => (
                                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-white p-3 rounded-lg border border-slate-200">
                                        <div className="md:col-span-4">
                                            <label className="text-xs text-slate-400 font-semibold uppercase">Item Name</label>
                                            <input 
                                                type="text" 
                                                value={item.name}
                                                onChange={(e) => handleUpdateItem(template.id, { ...item, name: e.target.value })}
                                                className="w-full text-sm font-medium border-b border-dashed border-slate-300 focus:border-lowes-blue focus:outline-none py-1"
                                            />
                                        </div>
                                        <div className="md:col-span-5">
                                            <label className="text-xs text-slate-400 font-semibold uppercase">Description</label>
                                            <input 
                                                type="text" 
                                                value={item.description}
                                                onChange={(e) => handleUpdateItem(template.id, { ...item, description: e.target.value })}
                                                className="w-full text-sm text-slate-500 border-b border-dashed border-slate-300 focus:border-lowes-blue focus:outline-none py-1"
                                            />
                                        </div>
                                        <div className="md:col-span-2 relative">
                                            <label className="text-xs text-slate-400 font-semibold uppercase">Est. Price</label>
                                            <span className="absolute left-0 bottom-1 text-sm text-slate-400">$</span>
                                            <input 
                                                type="number" 
                                                value={item.defaultPrice}
                                                onChange={(e) => handleUpdateItem(template.id, { ...item, defaultPrice: parseFloat(e.target.value) })}
                                                className="w-full pl-3 text-sm font-bold text-slate-700 border-b border-dashed border-slate-300 focus:border-lowes-blue focus:outline-none py-1"
                                            />
                                        </div>
                                        <div className="md:col-span-1 flex justify-end pt-4">
                                            <button 
                                                onClick={() => handleDeleteItem(template.id, item.id)}
                                                className="text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {template.items.length === 0 && (
                                    <div className="text-center py-6 text-slate-400 bg-slate-100 rounded-lg border border-dashed border-slate-300">
                                        No items in this kit yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};