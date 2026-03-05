import { fetch } from 'undici';

export async function fetchPage(url: string): Promise<string> {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  if (response.status === 403 || response.status === 429) {
    const error: any = new Error(`Upstream blocked: ${response.status}`);
    error.status = 502;
    error.hint = 'Upstream blocked (403/429). Lowe\'s might be detecting scraping.';
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText} (${response.status})`);
  }

  return response.text();
}
