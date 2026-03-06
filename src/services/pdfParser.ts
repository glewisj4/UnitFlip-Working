import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    
    // Improved text extraction that respects newlines
    const pageText = content.items
      .map((item: any) => {
        // Add a newline if the item marks the end of a line, otherwise a space
        return item.str + (item.hasEOL ? '\n' : ' ');
      })
      .join('');
      
    text += pageText + '\n';
  }

  return text;
}
