import { RetailAdapter, ResolvedRetailProduct } from './types.js';
import { fetchPage } from './fetchPage.js';
import { extractJsonLd, extractNextData, extractMeta } from './extractors.js';

export class LowesAdapter implements RetailAdapter {
  retailer = 'LOWES';

  canHandle(url: string): boolean {
    return url.includes('lowes.com');
  }

  async resolve(url: string): Promise<ResolvedRetailProduct> {
    const html = await fetchPage(url);
    const warnings: string[] = [];

    // 1. JSON-LD
    const jsonLd = extractJsonLd(html);
    const productLd = jsonLd.find(item => item['@type'] === 'Product' || item['@type']?.includes('Product'));

    if (productLd) {
      return {
        title: productLd.name,
        brand: productLd.brand?.name || productLd.brand,
        price: productLd.offers?.price ? {
          amount: parseFloat(productLd.offers.price),
          currency: 'USD'
        } : undefined,
        imageUrl: Array.isArray(productLd.image) ? productLd.image[0] : productLd.image,
        description: productLd.description,
        source: { retailer: 'LOWES', url },
        confidence: 'high',
        warnings
      };
    }

    // 2. NEXT_DATA
    const nextData = extractNextData(html);
    if (nextData) {
      const productData = nextData.props?.pageProps?.productDetails || nextData.props?.pageProps?.product;
      if (productData) {
        return {
          title: productData.title || productData.description,
          brand: productData.brand,
          price: productData.price?.totalPrice ? {
            amount: parseFloat(productData.price.totalPrice),
            currency: 'USD'
          } : undefined,
          imageUrl: productData.imageUrls?.[0] || productData.mainImageUrl,
          description: productData.marketingDescription || productData.description,
          source: { retailer: 'LOWES', url, itemNumber: productData.itemNumber },
          confidence: 'medium',
          warnings
        };
      }
    }

    // 3. Fallback Meta
    const meta = extractMeta(html);
    if (meta.title) {
      return {
        title: meta.title,
        imageUrl: meta.image,
        description: meta.description,
        source: { retailer: 'LOWES', url },
        confidence: 'low',
        warnings: [...warnings, 'Extracted from meta tags only']
      };
    }

    throw new Error('Could not extract product data from Lowe\'s page');
  }
}
