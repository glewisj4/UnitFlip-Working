import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { LRUCache } from 'lru-cache';
import { LowesAdapter } from './lowesAdapter.js';
import { ResolvedRetailProduct } from './types.js';

const fastify = Fastify({ logger: true });

// Register CORS
await fastify.register(cors, {
  origin: true, // Allow all origins in dev
});

// Register Rate Limiting
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// In-memory caching (LRU) for 30 minutes
const cache = new LRUCache<string, { ok: boolean; resolved: ResolvedRetailProduct; fetchedAt: string }>({
  max: 500,
  ttl: 1000 * 60 * 30, // 30 minutes
});

const adapters = [new LowesAdapter()];

fastify.get('/health', async () => {
  return { ok: true };
});

fastify.get('/resolve/lowes', async (request, reply) => {
  const { url } = request.query as { url: string };
  
  if (!url) {
    return reply.status(400).send({ ok: false, error: 'Missing URL parameter' });
  }

  const decodedUrl = decodeURIComponent(url);
  
  // Check cache
  const cached = cache.get(decodedUrl);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const adapter = adapters.find(a => a.canHandle(decodedUrl));
  if (!adapter) {
    return reply.status(400).send({ ok: false, error: 'Unsupported retailer URL' });
  }

  try {
    const resolved = await adapter.resolve(decodedUrl);
    const result = {
      ok: true,
      resolved,
      fetchedAt: new Date().toISOString(),
    };
    
    // Store in cache
    cache.set(decodedUrl, result);
    
    return result;
  } catch (error: any) {
    fastify.log.error(error);
    
    if (error.status === 502) {
      return reply.status(502).send({
        ok: false,
        error: error.message,
        hint: error.hint
      });
    }

    return reply.status(500).send({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 4317, host: '0.0.0.0' });
    console.log('Retail Resolver server running on http://localhost:4317');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
