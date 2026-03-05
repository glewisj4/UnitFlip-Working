import * as cheerio from 'cheerio';
import { ResolvedRetailProduct } from './types.js';

export function extractJsonLd(html: string): any[] {
  const $ = cheerio.load(html);
  const jsonLd: any[] = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).text();
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        jsonLd.push(...parsed);
      } else {
        jsonLd.push(parsed);
      }
    } catch (e) {
      // Ignore malformed JSON
    }
  });
  
  return jsonLd;
}

export function extractNextData(html: string): any | null {
  const $ = cheerio.load(html);
  const nextData = $('#__NEXT_DATA__').text();
  if (!nextData) return null;
  
  try {
    return JSON.parse(nextData);
  } catch (e) {
    return null;
  }
}

export function extractMeta(html: string): { title?: string; image?: string; description?: string } {
  const $ = cheerio.load(html);
  return {
    title: $('meta[property="og:title"]').attr('content') || $('title').text(),
    image: $('meta[property="og:image"]').attr('content'),
    description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
  };
}
