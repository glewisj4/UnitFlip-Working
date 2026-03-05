export interface Unit {
  id: string;
  orgId: string;
  name: string;
  address1?: string;
  city?: string;
  state?: string;
  zip?: string;
  createdAt: number;
  updatedAt: number;
  status?: 'active' | 'archived';
}

export type InspectionStatus = 'draft' | 'in_progress' | 'completed';

export interface Inspection {
  id: string;
  orgId: string;
  unitId: string;
  title: string;
  status: InspectionStatus;
  createdAt: number;
  updatedAt: number;
  createdByUserId: string;
  lastEditedByUserId?: string;
  notes?: string;
  roomSelections?: string[];
  productIds?: string[];
  photoIds: string[];
}
