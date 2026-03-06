import { ImportBatch } from '../core/models/types';

export interface ParsedItem {
  rawTitle: string;
  itemNumber: string | null;
  modelNumber: string | null;
  fulfillmentType: string | null;
  unitPrice: number | null;
  qty: number | null;
  lineTotal: number | null;
}

export interface ParseResult {
  batch: Partial<ImportBatch>;
  items: ParsedItem[];
}

export function parseLowesQuote(text: string): ParseResult {
  const batch: Partial<ImportBatch> = {};
  const items: ParsedItem[] = [];

  // 1. Parse Metadata (Global Search)
  const quoteMatch = text.match(/Quote\s*#\s*[:\.]?\s*(\d+)/i);
  if (quoteMatch) batch.quoteNumber = quoteMatch[1];

  const storeMatch = text.match(/Store\s*#\s*[:\.]?\s*(\d+)/i);
  if (storeMatch) batch.storeNumber = storeMatch[1];

  const dateMatch = text.match(/Created\s*Date\s*[:\.]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (dateMatch) {
    try {
      batch.createdDate = new Date(dateMatch[1]).toISOString();
    } catch {}
  }

  const validMatch = text.match(/Valid\s*Until\s*[:\.]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (validMatch) {
    try {
      batch.validUntil = new Date(validMatch[1]).toISOString();
    } catch {}
  }

  const subtotalMatch = text.match(/Subtotal\s*\$([\d,]+\.\d{2})/i);
  if (subtotalMatch) {
    batch.subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
  }

  const estTotalMatch = text.match(/Estimated\s*Total\s*\$([\d,]+\.\d{2})/i);
  if (estTotalMatch) {
    batch.estimatedTotal = parseFloat(estTotalMatch[1].replace(/,/g, ''));
  }

  // 2. Parse Line Items (Line-by-Line Anchor Strategy)
  // We look for lines containing prices, then look backwards for item details.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Helper to check if a line is a summary line
  const isSummaryLine = (line: string) => {
    return /Subtotal|Total|Tax|Savings|Recycling|Fee|Shipping|Delivery/i.test(line);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for Price Pattern: $XX.XX
    // We are looking for the "Line Item Row" which usually contains the price/qty
    const priceMatches = [...line.matchAll(/\$([\d,]+\.\d{2})/g)];
    
    if (priceMatches.length > 0 && !isSummaryLine(line)) {
      // This is a candidate for a line item anchor
      
      // Extract Qty if present on this line (e.g. "1 $50.00" or "Qty 1")
      let qty = 1;
      const qtyMatch = line.match(/(?:Qty|Quantity)?\s*(\d+)\s*[\$@]/i) || line.match(/^(\d+)\s+\$/);
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10);
      }

      // Extract Prices
      // If multiple prices, usually Unit Price then Total, or vice versa depending on layout.
      // Heuristic: Smallest is Unit, Largest is Total.
      const prices = priceMatches.map(m => parseFloat(m[1].replace(/,/g, '')));
      const unitPrice = Math.min(...prices);
      const lineTotal = Math.max(...prices);

      // Now look BACKWARDS for Item # and Description
      // We scan up to 10 previous lines
      let itemNumber: string | null = null;
      let modelNumber: string | null = null;
      let fulfillmentType: string | null = null;
      let descriptionLines: string[] = [];
      
      // Regex for Item/Model with optional separators
      const itemRegex = /(?:Item|SOS|Article)\s*(?:#|No\.?|Number)?\s*[:\.-]?\s*(\d+)/i;
      const modelRegex = /Model\s*(?:#|No\.?|Number)?\s*[:\.-]?\s*([A-Z0-9-]+)/i;

      // Check current line first for Item/Model (sometimes everything is on one line)
      const currentItemMatch = line.match(itemRegex);
      if (currentItemMatch) itemNumber = currentItemMatch[1];
      
      const currentModelMatch = line.match(modelRegex);
      if (currentModelMatch) modelNumber = currentModelMatch[1];

      // Scan previous lines
      let linesBack = 0;
      for (let j = i - 1; j >= 0 && linesBack < 12; j--) {
        const prevLine = lines[j];
        linesBack++;

        // Stop if we hit another price line (likely previous item)
        if (/\$([\d,]+\.\d{2})/.test(prevLine) && !isSummaryLine(prevLine)) break;
        
        // Stop if we hit a clear separator or metadata
        if (/Quote\s*#/i.test(prevLine)) break;

        // Check for Fulfillment/Location info to extract and remove from description
        if (/Parcel|Truck|Pickup|Delivery|Shipping|Carry\s*Out/i.test(prevLine)) {
             // This is likely fulfillment info
             const type = prevLine.match(/Parcel|Truck|Pickup|Delivery|Shipping|Carry\s*Out/i)?.[0];
             if (type) fulfillmentType = type.toUpperCase();
             continue; // Skip adding to description
        }
        
        if (/Aisle|Bin|Bay|Location/i.test(prevLine)) {
            continue; // Skip location info
        }

        // Check for Item #
        if (!itemNumber) {
          const m = prevLine.match(itemRegex);
          if (m) {
            itemNumber = m[1];
            // If this line is JUST identifiers, don't add to description
            if (prevLine.replace(itemRegex, '').replace(modelRegex, '').trim().length < 5) {
              continue; 
            }
          }
        }

        // Check for Model #
        if (!modelNumber) {
          const m = prevLine.match(modelRegex);
          if (m) {
             modelNumber = m[1];
             // If line is just model, skip
             if (prevLine.replace(modelRegex, '').trim().length < 3) continue;
          }
        }

        // Collect potential description lines
        // Ignore lines that are just identifiers
        if (!prevLine.match(itemRegex) && !prevLine.match(modelRegex)) {
           // Clean up any stray "Item #" or "Model #" text if it wasn't caught by the regex match above (e.g. if it was part of a longer line)
           let clean = prevLine.replace(itemRegex, '').replace(modelRegex, '').trim();
           
           // Filter out common noise
           if (/^[\d\s]+$/.test(clean)) continue; // Just numbers
           if (clean.length > 2) descriptionLines.unshift(clean);
        } else {
           // If line has identifiers but also text, clean it and add
           let clean = prevLine.replace(itemRegex, '').replace(modelRegex, '').trim();
           if (clean.length > 2) descriptionLines.unshift(clean);
        }
      }

      // If we still don't have an Item #, try to find a standalone 5+ digit number in the previous lines
      // This is risky but needed if labels are missing
      if (!itemNumber) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
           const prevLine = lines[j];
           // Look for 5-12 digits surrounded by spaces or start/end
           const m = prevLine.match(/(?:^|\s)(\d{5,12})(?:\s|$)/);
           if (m) {
             itemNumber = m[1];
             break;
           }
        }
      }

      // Construct Title
      let rawTitle = descriptionLines.join(' ').trim();
      if (!rawTitle) rawTitle = "Unknown Item";

      // Add to items
      items.push({
        rawTitle,
        itemNumber,
        modelNumber,
        fulfillmentType: fulfillmentType || line.match(/Parcel|Truck|Pickup|Delivery/i)?.[0] || 'PICKUP',
        unitPrice,
        qty,
        lineTotal
      });
    }
  }

  return { batch, items };
}
