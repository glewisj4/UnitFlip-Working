export async function fetchLowesProductImage(itemNumber: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.lowes.com/pd/${itemNumber}`);
    if (!response.ok) return null;

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const script = doc.querySelector('script[type="application/ld+json"]');
    if (script) {
      const json = JSON.parse(script.textContent || '{}');
      if (json.image) {
        return Array.isArray(json.image) ? json.image[0] : json.image;
      }
    }

    // Fallback: Try meta tags
    const metaImage = doc.querySelector('meta[property="og:image"]');
    if (metaImage) {
      return metaImage.getAttribute('content');
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch Lowe\'s product image:', error);
    return null;
  }
}
