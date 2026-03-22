import {
  Finding,
  FindingCategory,
  MaterialRequirement,
  RepairTask,
  TradeOption,
} from '../models/operations';

interface MaterialTemplate {
  category: string;
  itemDescription: string;
  quantity: number;
  unit: string;
  confidence: MaterialRequirement['confidence'];
  notes?: string;
}

interface TaskGenerationRule {
  id: string;
  categories: FindingCategory[];
  keywords: string[];
  title: string;
  trade: TradeOption;
  effortMinutes: number;
  materials: MaterialTemplate[];
}

const TASK_RULES: TaskGenerationRule[] = [
  {
    id: 'drywall_patch',
    categories: ['drywall'],
    keywords: ['hole', 'dent', 'crack', 'patch'],
    title: 'Patch and sand drywall',
    trade: 'drywall',
    effortMinutes: 90,
    materials: [
      { category: 'drywall', itemDescription: 'Joint compound', quantity: 1, unit: 'tub', confidence: 'high' },
      { category: 'drywall', itemDescription: 'Drywall patch kit', quantity: 1, unit: 'each', confidence: 'medium' },
      { category: 'drywall', itemDescription: 'Sanding sponge', quantity: 1, unit: 'each', confidence: 'high' },
    ],
  },
  {
    id: 'paint_touchup',
    categories: ['paint'],
    keywords: ['scuff', 'paint', 'chip', 'peel', 'mark'],
    title: 'Repaint wall',
    trade: 'paint',
    effortMinutes: 120,
    materials: [
      { category: 'paint', itemDescription: 'Interior paint', quantity: 1, unit: 'gallon', confidence: 'medium' },
      { category: 'paint', itemDescription: "Painter's tape", quantity: 1, unit: 'roll', confidence: 'high' },
      { category: 'paint', itemDescription: 'Roller cover', quantity: 1, unit: 'each', confidence: 'medium' },
    ],
  },
  {
    id: 'outlet_cover',
    categories: ['electrical'],
    keywords: ['outlet cover', 'cover plate', 'wall plate'],
    title: 'Replace outlet cover',
    trade: 'electrical',
    effortMinutes: 20,
    materials: [
      { category: 'electrical', itemDescription: 'Outlet cover', quantity: 1, unit: 'each', confidence: 'high' },
    ],
  },
  {
    id: 'electrical_device',
    categories: ['electrical'],
    keywords: ['outlet', 'switch', 'receptacle'],
    title: 'Repair electrical device',
    trade: 'electrical',
    effortMinutes: 45,
    materials: [
      { category: 'electrical', itemDescription: 'Replacement receptacle or switch', quantity: 1, unit: 'each', confidence: 'medium' },
      { category: 'electrical', itemDescription: 'Wall plate', quantity: 1, unit: 'each', confidence: 'medium' },
    ],
  },
  {
    id: 'fixture_replace',
    categories: ['fixture'],
    keywords: ['vanity', 'fixture', 'light', 'damaged'],
    title: 'Replace vanity fixture',
    trade: 'fixture',
    effortMinutes: 60,
    materials: [
      { category: 'fixture', itemDescription: 'Replacement fixture', quantity: 1, unit: 'each', confidence: 'medium' },
      { category: 'fixture', itemDescription: 'Mounting hardware kit', quantity: 1, unit: 'kit', confidence: 'medium' },
    ],
  },
  {
    id: 'plumbing_fixture',
    categories: ['plumbing'],
    keywords: ['leak', 'faucet', 'toilet', 'drip'],
    title: 'Repair plumbing fixture',
    trade: 'plumbing',
    effortMinutes: 75,
    materials: [
      { category: 'plumbing', itemDescription: 'Fixture repair kit', quantity: 1, unit: 'kit', confidence: 'medium' },
      { category: 'plumbing', itemDescription: 'Sealant or plumber tape', quantity: 1, unit: 'roll', confidence: 'medium' },
    ],
  },
  {
    id: 'flooring_repair',
    categories: ['flooring'],
    keywords: ['scratch', 'plank', 'tile', 'floor'],
    title: 'Repair flooring finish',
    trade: 'flooring',
    effortMinutes: 90,
    materials: [
      { category: 'flooring', itemDescription: 'Replacement flooring material', quantity: 12, unit: 'sq_ft', confidence: 'low' },
      { category: 'flooring', itemDescription: 'Flooring adhesive', quantity: 1, unit: 'tube', confidence: 'medium' },
    ],
  },
  {
    id: 'trim_repair',
    categories: ['trim'],
    keywords: ['baseboard', 'trim', 'casing'],
    title: 'Repair or replace trim',
    trade: 'finish',
    effortMinutes: 60,
    materials: [
      { category: 'trim', itemDescription: 'Baseboard trim', quantity: 12, unit: 'ft', confidence: 'medium' },
      { category: 'trim', itemDescription: 'Paintable caulk', quantity: 1, unit: 'tube', confidence: 'medium' },
    ],
  },
  {
    id: 'cleaning_turn',
    categories: ['cleaning'],
    keywords: ['clean', 'debris', 'trash', 'dirty'],
    title: 'Deep clean area',
    trade: 'cleaning',
    effortMinutes: 45,
    materials: [
      { category: 'cleaning', itemDescription: 'Degreaser or all-purpose cleaner', quantity: 1, unit: 'bottle', confidence: 'high' },
      { category: 'cleaning', itemDescription: 'Contractor trash bags', quantity: 1, unit: 'box', confidence: 'medium' },
    ],
  },
  {
    id: 'safety_correction',
    categories: ['safety'],
    keywords: ['trip', 'hazard', 'smoke', 'safety'],
    title: 'Correct safety issue',
    trade: 'safety',
    effortMinutes: 30,
    materials: [
      { category: 'safety', itemDescription: 'Safety replacement component', quantity: 1, unit: 'each', confidence: 'medium' },
    ],
  },
];

const CATEGORY_DEFAULT_RULES: Record<FindingCategory, Omit<TaskGenerationRule, 'id' | 'keywords' | 'categories'>> = {
  paint: {
    title: 'Touch up paint damage',
    trade: 'paint',
    effortMinutes: 90,
    materials: [{ category: 'paint', itemDescription: 'Interior paint', quantity: 1, unit: 'gallon', confidence: 'medium' }],
  },
  drywall: {
    title: 'Repair drywall surface',
    trade: 'drywall',
    effortMinutes: 90,
    materials: [{ category: 'drywall', itemDescription: 'Joint compound', quantity: 1, unit: 'tub', confidence: 'medium' }],
  },
  flooring: {
    title: 'Repair flooring issue',
    trade: 'flooring',
    effortMinutes: 90,
    materials: [{ category: 'flooring', itemDescription: 'Replacement flooring material', quantity: 8, unit: 'sq_ft', confidence: 'low' }],
  },
  appliance: {
    title: 'Service appliance issue',
    trade: 'appliance',
    effortMinutes: 60,
    materials: [{ category: 'appliance', itemDescription: 'Appliance replacement part', quantity: 1, unit: 'each', confidence: 'low' }],
  },
  plumbing: {
    title: 'Repair plumbing issue',
    trade: 'plumbing',
    effortMinutes: 75,
    materials: [{ category: 'plumbing', itemDescription: 'Plumbing repair kit', quantity: 1, unit: 'kit', confidence: 'medium' }],
  },
  electrical: {
    title: 'Repair electrical issue',
    trade: 'electrical',
    effortMinutes: 45,
    materials: [{ category: 'electrical', itemDescription: 'Electrical replacement component', quantity: 1, unit: 'each', confidence: 'medium' }],
  },
  fixture: {
    title: 'Repair fixture issue',
    trade: 'fixture',
    effortMinutes: 60,
    materials: [{ category: 'fixture', itemDescription: 'Replacement fixture hardware', quantity: 1, unit: 'kit', confidence: 'medium' }],
  },
  trim: {
    title: 'Repair finish trim',
    trade: 'finish',
    effortMinutes: 60,
    materials: [{ category: 'trim', itemDescription: 'Trim stock', quantity: 8, unit: 'ft', confidence: 'low' }],
  },
  cleaning: {
    title: 'Clean affected area',
    trade: 'cleaning',
    effortMinutes: 45,
    materials: [{ category: 'cleaning', itemDescription: 'Cleaning supplies', quantity: 1, unit: 'kit', confidence: 'medium' }],
  },
  exterior: {
    title: 'Repair exterior issue',
    trade: 'exterior',
    effortMinutes: 90,
    materials: [{ category: 'exterior', itemDescription: 'Exterior repair material', quantity: 1, unit: 'allowance', confidence: 'low' }],
  },
  safety: {
    title: 'Correct safety concern',
    trade: 'safety',
    effortMinutes: 30,
    materials: [{ category: 'safety', itemDescription: 'Safety correction material', quantity: 1, unit: 'each', confidence: 'medium' }],
  },
  general: {
    title: 'Address general turnover issue',
    trade: 'general',
    effortMinutes: 60,
    materials: [{ category: 'general', itemDescription: 'General repair material allowance', quantity: 1, unit: 'allowance', confidence: 'low' }],
  },
};

const pickGenerationRule = (finding: Finding): TaskGenerationRule => {
  const haystack = `${finding.description} ${finding.notes || ''}`.toLowerCase();
  const candidates = TASK_RULES
    .map((rule) => {
      const categoryMatch = rule.categories.includes(finding.category) ? 4 : 0;
      const keywordMatches = rule.keywords.reduce((count, keyword) => {
        return haystack.includes(keyword) ? count + 1 : count;
      }, 0);
      return { rule, score: categoryMatch + keywordMatches };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return 0;
    });

  if (candidates.length > 0) {
    return candidates[0].rule;
  }

  const fallback = CATEGORY_DEFAULT_RULES[finding.category];
  return {
    id: `default_${finding.category}`,
    categories: [finding.category],
    keywords: [],
    ...fallback,
  };
};

export const InspectionIntelligenceService = {
  buildTasksFromFindings(findings: Finding[]): Omit<RepairTask, 'id' | 'createdAt' | 'updatedAt'>[] {
    return findings.map((finding) => {
      const rule = pickGenerationRule(finding);
      return {
        orgId: finding.orgId,
        inspectionId: finding.inspectionId,
        unitId: finding.unitId,
        findingIds: [finding.id],
        title: rule.title,
        trade: rule.trade,
        priority: finding.priority,
        status: 'ready',
        estimatedEffortMinutes: rule.effortMinutes,
        notes: `${finding.area}: ${finding.description}`,
        metadata: {
          generationRuleId: rule.id,
          sourceFindingId: finding.id,
          sourceCategory: finding.category,
        },
      };
    });
  },

  buildMaterialRequirementsFromTasks(
    tasks: RepairTask[],
    findings: Finding[]
  ): Omit<MaterialRequirement, 'id' | 'createdAt' | 'updatedAt'>[] {
    const findingById = new Map(findings.map((finding) => [finding.id, finding]));

    return tasks.flatMap((task) => {
      const sourceFinding = task.findingIds.map((id) => findingById.get(id)).find(Boolean);
      const rule = sourceFinding ? pickGenerationRule(sourceFinding) : undefined;
      const materials = rule?.materials || [
        {
          category: task.trade,
          itemDescription: `${task.trade} material allowance`,
          quantity: 1,
          unit: 'allowance',
          confidence: 'low' as const,
        },
      ];

      return materials.map((material) => ({
        orgId: task.orgId,
        inspectionId: task.inspectionId,
        repairTaskId: task.id,
        category: material.category,
        itemDescription: material.itemDescription,
        quantity: material.quantity,
        unit: material.unit,
        confidence: material.confidence,
        source: 'rule' as const,
        status: 'draft' as const,
        roomLabel: sourceFinding?.area,
        sourceFindingId: sourceFinding?.id,
        notes: material.notes || task.notes,
        metadata: {
          sourceTaskId: task.id,
          sourceFindingId: sourceFinding?.id,
          generationRuleId: rule?.id,
        },
      }));
    });
  },
};
