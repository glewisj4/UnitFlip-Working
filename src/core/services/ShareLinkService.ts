import { createLocalDbAdapter } from '../adapters/createLocalDbAdapter';
import { ShareLink, ShareAccessEvent, ShareResourceType } from '../models/share';
import { Role } from '../models/auth';
import { createId } from '../../services/storage';
import { SyncQueueService } from './SyncQueueService';
import { AuthPolicyService } from './AuthPolicyService';
import { EdgeFunctionShareAdapter } from '../adapters/EdgeFunctionShareAdapter';

const LINKS_KEY_PREFIX = 'unitflip_share_links_v1:';
const ACCESS_KEY_PREFIX = 'unitflip_share_access_v1:';
const adapter = createLocalDbAdapter();
const remoteShareAdapter = import.meta.env.VITE_USE_EDGE_FUNCTIONS === 'true' ? new EdgeFunctionShareAdapter() : null;

// Helper to encode/decode base64url
const toBase64Url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (str: string) => atob(str.replace(/-/g, '+').replace(/_/g, '/'));

export const ShareLinkService = {
  async createLink(params: { 
    orgId: string; 
    userId: string; 
    role: Role; 
    reportId: string; 
    inspectionId?: string; 
    expiresAt?: number;
    resourceBucket?: string;
    resourcePath?: string;
    resourceContentType?: string;
    resourceLabel?: string;
  }): Promise<ShareLink> {
    // RBAC Check
    if (!AuthPolicyService.canManageShareLinks(params.role)) {
      throw new Error('Unauthorized: Only admins and developers can create share links');
    }

    const key = `${LINKS_KEY_PREFIX}${params.orgId}`;
    const links = (await adapter.getItem<ShareLink[]>(key)) || [];

    // Generate token: orgId encoded + random bytes
    // This allows us to know the orgId just from the token, enabling resolution without auth
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const randomStr = Array.from(randomBytes).map(b => String.fromCharCode(b)).join('');
    const token = `${toBase64Url(params.orgId)}.${toBase64Url(randomStr)}`;

    const newLink: ShareLink = {
      id: createId(),
      orgId: params.orgId,
      createdAt: Date.now(),
      createdByUserId: params.userId,
      createdByRole: params.role,
      token,
      resourceType: 'report_pdf',
      resourceId: params.reportId,
      inspectionId: params.inspectionId,
      resourceBucket: params.resourceBucket,
      resourcePath: params.resourcePath,
      resourceContentType: params.resourceContentType,
      resourceLabel: params.resourceLabel,
      expiresAt: params.expiresAt || Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days default
    };

    if (remoteShareAdapter) {
      await remoteShareAdapter.registerShareLink({
        link: {
          id: newLink.id,
          orgId: newLink.orgId,
          token: newLink.token,
          resourceId: newLink.resourceId,
          inspectionId: newLink.inspectionId,
          expiresAt: newLink.expiresAt,
          createdAt: newLink.createdAt,
          createdByUserId: newLink.createdByUserId,
          createdByRole: newLink.createdByRole,
          resourceBucket: newLink.resourceBucket,
          resourcePath: newLink.resourcePath,
          resourceContentType: newLink.resourceContentType,
          resourceLabel: newLink.resourceLabel,
        },
      });
    }

    links.push(newLink);
    await adapter.setItem(key, links);

    // Sync Op
    await SyncQueueService.enqueue(params.orgId, {
      type: 'CREATE_SHARE_LINK',
      userId: params.userId,
      payload: newLink as any
    });

    return newLink;
  },

  async listLinks(orgId: string, params?: { inspectionId?: string; includeRevoked?: boolean }): Promise<ShareLink[]> {
    const key = `${LINKS_KEY_PREFIX}${orgId}`;
    const links = (await adapter.getItem<ShareLink[]>(key)) || [];
    
    let filtered = links;
    if (params?.inspectionId) {
      filtered = filtered.filter(l => l.inspectionId === params.inspectionId);
    }
    if (!params?.includeRevoked) {
      filtered = filtered.filter(l => !l.revokedAt);
    }

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },

  async revokeLink(params: { orgId: string; userId: string; role: Role; token: string }): Promise<void> {
    // RBAC Check
    if (!AuthPolicyService.canManageShareLinks(params.role)) {
      throw new Error('Unauthorized: Only admins and developers can revoke share links');
    }

    const key = `${LINKS_KEY_PREFIX}${params.orgId}`;
    const links = (await adapter.getItem<ShareLink[]>(key)) || [];
    const revokedAt = Date.now();

    if (remoteShareAdapter) {
      await remoteShareAdapter.revokeShareLink({
        orgId: params.orgId,
        token: params.token,
        revokedAt,
        revokedByUserId: params.userId,
      });
    }

    const updatedLinks = links.map(l => {
      if (l.token === params.token) {
        return {
          ...l,
          revokedAt,
          revokedByUserId: params.userId
        };
      }
      return l;
    });

    await adapter.setItem(key, updatedLinks);

    // Sync Op
    await SyncQueueService.enqueue(params.orgId, {
      type: 'REVOKE_SHARE_LINK',
      userId: params.userId,
      payload: { token: params.token }
    });
  },

  async resolveLink(token: string): Promise<{ link: ShareLink | null; status: 'ok' | 'expired' | 'revoked' | 'not_found' }> {
    try {
      // Extract orgId from token (first part before dot)
      const [encodedOrgId] = token.split('.');
      if (!encodedOrgId) return { link: null, status: 'not_found' };
      
      const orgId = fromBase64Url(encodedOrgId);
      const key = `${LINKS_KEY_PREFIX}${orgId}`;
      const links = (await adapter.getItem<ShareLink[]>(key)) || [];
      
      const link = links.find(l => l.token === token);
      
      if (!link) {
        return { link: null, status: 'not_found' };
      }

      if (link.revokedAt) {
        return { link, status: 'revoked' };
      }

      if (Date.now() > link.expiresAt) {
        return { link, status: 'expired' };
      }

      return { link, status: 'ok' };
    } catch (e) {
      console.error('Error resolving link', e);
      return { link: null, status: 'not_found' };
    }
  },

  async logAccess(event: Omit<ShareAccessEvent, 'id' | 'ts'> & { id?: string; ts?: number }): Promise<void> {
    const fullEvent: ShareAccessEvent = {
      id: event.id || createId(),
      ts: event.ts || Date.now(),
      ...event
    };

    const key = `${ACCESS_KEY_PREFIX}${event.orgId}`;
    const logs = (await adapter.getItem<ShareAccessEvent[]>(key)) || [];
    logs.push(fullEvent);
    await adapter.setItem(key, logs);

    // Sync Op
    await SyncQueueService.enqueue(event.orgId, {
      type: 'SHARE_ACCESS_EVENT',
      userId: 'system', // or anonymous
      payload: fullEvent as any
    });
  },

  async listAccess(orgId: string, token?: string, limit = 50): Promise<ShareAccessEvent[]> {
    const key = `${ACCESS_KEY_PREFIX}${orgId}`;
    const logs = (await adapter.getItem<ShareAccessEvent[]>(key)) || [];
    
    let filtered = logs;
    if (token) {
      filtered = filtered.filter(l => l.token === token);
    }
    
    return filtered.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }
};
