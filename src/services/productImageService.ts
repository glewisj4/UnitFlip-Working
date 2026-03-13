export async function fetchLowesProductImage(itemNumber: string): Promise<string | null> {
  try {
    // 1. Fetch product page
    const response = await fetch(`https://www.lowes.com/pd/${itemNumber}`);
    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 2. Parse JSON-LD script block
    const script = doc.querySelector('script[type="application/ld+json"]');
    if (script) {
      const json = JSON.parse(script.textContent || '{}');
      
      // 3. Extract image
      if (json.image) {
        return Array.isArray(json.image) ? json.image[0] : json.image;
      }
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch Lowe\'s product image:', error);
    return null;
  }
}
