import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export async function extractPdfTextItems(file: File): Promise<PdfTextItem[]> {
  // Safety Check
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files are supported');
  }
  if (file.size > 10 * 1024 * 1024) { // 10MB
    throw new Error('File size exceeds 10MB limit');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const items: PdfTextItem[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    content.items.forEach((item: any) => {
      // transform[4] is x, transform[5] is y
      // Note: PDF coordinates usually start from bottom-left, but pdf.js might give them differently.
      // We will assume standard PDF coordinates where y grows upwards, or use them as provided.
      // Usually we want to sort by Y descending (top to bottom) for visual reading order.
      
      const tx = item.transform;
      items.push({
        text: item.str,
        x: tx[4],
        y: tx[5],
        width: item.width,
        height: item.height,
        page: i
      });
    });
  }

  return items;
}

export async function extractPdfText(file: File): Promise<string> {
  const items = await extractPdfTextItems(file);
  // Simple fallback for backward compatibility if needed, though we prefer the structured one
  return items.map(i => i.text).join(' ');
}
