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

/**
 * Calls the local retail-resolver server to extract product data from a Lowe's URL.
 * The resolver server must be running on http://localhost:4317
 */
export async function resolveLowesUrl(url: string): Promise<ResolvedRetailProduct> {
  const resolverUrl = `http://localhost:4317/resolve/lowes?url=${encodeURIComponent(url)}`;
  
  try {
    const response = await fetch(resolverUrl);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `Failed to resolve URL: ${response.statusText}`);
    }
    
    return data.resolved;
  } catch (error: any) {
    console.error('Retail resolve error:', error);
    throw error;
  }
}
