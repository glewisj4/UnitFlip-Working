export interface ResolvedRetailProduct {
  title: string;
  brand?: string;
  price?: { amount: number; currency: "USD" };
  imageUrl?: string;
  description?: string;
  uom?: string;
  categoryPath?: string[];
  source: { retailer: "LOWES"; url: string; itemNumber?: string };
  confidence: "high" | "medium" | "low";
  warnings?: string[];
}

export interface RetailAdapter {
  retailer: string;
  canHandle(url: string): boolean;
  resolve(url: string): Promise<ResolvedRetailProduct>;
}
