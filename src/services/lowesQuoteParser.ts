import { ImportBatch } from '../core/models/types';
import { PdfTextItem } from './pdfParser';

export interface ParsedItem {
  rawTitle: string;
  itemNumber: string | null;
  modelNumber: string | null;
  unitPrice: number | null;
  qty: number | null;
}

export interface PdfRow {
  page: number;
  y: number;
  items: PdfTextItem[];
  text: string;
}

export interface ParseResult {
  batch: Partial<ImportBatch>;
  items: ParsedItem[];
  warnings: string[];
  debug: {
    rowCount: number;
    rows: PdfRow[];
    anchors: Array<{
      rowText: string;
      itemNumber: string;
      modelNumber: string;
      titleRows: string[];
      pricingRow: string | null;
    }>;
  };
}

function groupTextItemsIntoRows(items: PdfTextItem[]): PdfRow[] {
  // 1. Sort by Page ASC, Y DESC (top to bottom), X ASC (left to right)
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    // Y is usually bottom-up in PDF, so higher Y is higher on page.
    // We want top-to-bottom reading order, so sort by Y DESC.
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y; 
    return a.x - b.x;
  });

  const rows: PdfRow[] = [];
  let currentRow: PdfRow | null = null;

  // Tolerance for Y alignment
  const Y_TOLERANCE = 4; 

  for (const item of sorted) {
    if (!item.text.trim()) continue; // Skip empty text items

    if (!currentRow) {
      currentRow = { page: item.page, y: item.y, items: [item], text: item.text };
    } else {
      // Check if same row
      if (item.page === currentRow.page && Math.abs(item.y - currentRow.y) <= Y_TOLERANCE) {
        currentRow.items.push(item);
        // We will reconstruct text later after sorting row items
      } else {
        // New row
        rows.push(currentRow);
        currentRow = { page: item.page, y: item.y, items: [item], text: item.text };
      }
    }
  }
  if (currentRow) rows.push(currentRow);

  // Finalize row text by sorting items by X and joining
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = row.items.map(i => i.text).join(' ').trim();
  }

  return rows;
}

export function parseLowesQuote(pdfItems: PdfTextItem[]): ParseResult {
  const rows = groupTextItemsIntoRows(pdfItems);
  const batch: Partial<ImportBatch> = {};
  const items: ParsedItem[] = [];
  const warnings: string[] = [];
  const debugAnchors: any[] = [];

  // --- METADATA PARSING ---
  for (const row of rows) {
    const text = row.text;
    
    const quoteMatch = text.match(/Quote\s*#\s*:?\s*(\d+)/i);
    if (quoteMatch && !batch.quoteNumber) batch.quoteNumber = quoteMatch[1];

    const createdDateMatch = text.match(/Created on\s*:?\s*(.+)/i);
    if (createdDateMatch && !batch.createdDate) {
      try {
        batch.createdDate = new Date(createdDateMatch[1]).toISOString();
      } catch {}
    }

    const validUntilMatch = text.match(/Quote valid until\s*:?\s*(.+?)*/i);
    if (validUntilMatch && !batch.validUntil) {
      try {
        batch.validUntil = new Date(validUntilMatch[1]).toISOString();
      } catch {}
    }

    const storeMatch = text.match(/Store\s*#\s*:?\s*(\d+)/i);
    if (storeMatch && !batch.storeNumber) batch.storeNumber = storeMatch[1];

    const estTotalMatch = text.match(/Estimated Total\s*:?\s*\$([0-9,]+\.[0-9]{2})/i);
    if (estTotalMatch && !batch.estimatedTotal) {
      batch.estimatedTotal = parseFloat(estTotalMatch[1].replace(/,/g, ''));
    }
  }

  // --- ITEM PARSING ---
  // Anchor Regex: Item #: ... | Model #: ...
  const anchorRegex = /Item\s*#:\s*(\d+)\s*\|\s*Model\s*#:\s*([A-Z0-9\-]+)/i;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = row.text.match(anchorRegex);

    if (match) {
      const itemNumber = match[1];
      const modelNumber = match[2];
      const debugAnchor: any = {
        rowText: row.text,
        itemNumber,
        modelNumber,
        titleRows: [],
        pricingRow: null
      };

      // --- TITLE SEARCH (Look UP) ---
      let rawTitle = '';
      const titleParts: string[] = [];
      const debugTitleFiltering: string[] = [];
      
      // Heuristic: Description is usually on the left side.
      // Standard PDF page width is ~612pts. 
      // We'll ignore text items starting past x=420 to avoid price/qty columns.
      const DESCRIPTION_MAX_X = 420;

      for (let j = 1; j <= 3; j++) {
        const prevIdx = i - j;
        if (prevIdx < 0) break;
        const prevRow = rows[prevIdx];

        // Stop conditions (Row level)
        if (prevRow.page !== row.page) break; // Must be same page
        if (anchorRegex.test(prevRow.text)) break; // Hit another item
        if (/Unit Price/i.test(prevRow.text)) break;
        if (/Description/i.test(prevRow.text)) break;
        if (/Item\s*#/i.test(prevRow.text)) break;
        if (/^Store\s*#/i.test(prevRow.text)) break;
        if (/^Quote\s*#/i.test(prevRow.text)) break;
        if (/^Item Subtotal/i.test(prevRow.text)) break;

        // Item level filtering
        const rowValidTexts: string[] = [];
        
        for (const item of prevRow.items) {
            let isExcluded = false;
            let reason = '';

            // 1. Filter by X position
            if (item.x > DESCRIPTION_MAX_X) {
                isExcluded = true;
                reason = `X-Pos(${Math.round(item.x)} > ${DESCRIPTION_MAX_X})`;
            }
            
            // 2. Filter by content keywords
            else if (/\$/.test(item.text)) {
                isExcluded = true;
                reason = 'Contains $';
            }
            else if (/(?:PICKUP|PARCEL|DELIVERY|Lowe's|Item\s*#|Model\s*#)/i.test(item.text)) {
                isExcluded = true;
                reason = 'Keyword Match';
            }
            // 3. Filter standalone numbering "1." or "10."
            else if (/^\d+\.$/.test(item.text.trim())) {
                isExcluded = true;
                reason = 'Numbering Prefix';
            }

            if (isExcluded) {
                debugTitleFiltering.push(`[Excluded] "${item.text}" (${reason})`);
            } else {
                rowValidTexts.push(item.text);
            }
        }

        if (rowValidTexts.length > 0) {
            // Prepend because we are scanning upwards (bottom-to-top)
            // But within the row, items are left-to-right.
            // So we just join the row's valid texts.
            titleParts.unshift(rowValidTexts.join(' '));
        }
      }

      if (titleParts.length > 0) {
        rawTitle = titleParts.join(' ');
        
        // Final Cleanup
        // Remove leading numbering if it survived (e.g. "1. Some Title")
        // Also handle "1 )", "1-", "1 –"
        rawTitle = rawTitle.replace(/^\s*\d+\s*[\.\-\)\–]\s*/, '');
        // Collapse whitespace
        rawTitle = rawTitle.replace(/\s+/g, ' ').trim();
      } else {
        rawTitle = modelNumber || 'Unknown Item';
        warnings.push(`No title found for Item # ${itemNumber}, using Model #`);
      }
      
      debugAnchor.titleRows = titleParts;
      debugAnchor.titleFiltering = debugTitleFiltering;

      // --- PRICE SEARCH (Look DOWN) ---
      let unitPrice: number | null = null;
      let qty: number | null = null;
      
      for (let k = 1; k <= 3; k++) {
        const nextIdx = i + k;
        if (nextIdx >= rows.length) break;
        const nextRow = rows[nextIdx];

        // Stop conditions
        if (anchorRegex.test(nextRow.text)) break;
        if (/^Item Subtotal/i.test(nextRow.text)) break;
        if (/^Estimated Total/i.test(nextRow.text)) break;

        // Price Regex: Matches "$61.98 1 $61.98"
        // Group 1: Unit Price
        // Group 2: Qty
        const priceLineRegex = /(?:PICKUP|PARCEL|DELIVERY)?\s*\$([0-9,]+\.[0-9]{2})\s+(\d+)\s+\$([0-9,]+\.[0-9]{2})/;
        const priceMatch = nextRow.text.match(priceLineRegex);

        if (priceMatch) {
          unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
          qty = parseInt(priceMatch[2], 10);
          debugAnchor.pricingRow = nextRow.text;
          break;
        }
      }

      if (unitPrice === null) warnings.push(`Missing price for Item # ${itemNumber}`);
      if (qty === null) {
        if (unitPrice !== null) {
          qty = 1;
          warnings.push(`Missing quantity for Item # ${itemNumber}, defaulting to 1`);
        }
      }

      items.push({
        rawTitle,
        itemNumber,
        modelNumber,
        unitPrice,
        qty
      });
      debugAnchors.push(debugAnchor);
    }
  }

  return {
    batch,
    items,
    warnings,
    debug: {
      rowCount: rows.length,
      rows,
      anchors: debugAnchors
    }
  };
}
