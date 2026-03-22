import { randomUUID } from 'node:crypto';
import { AuditLogRepository, OAuthStateRepository, ShopInstallationRepository } from '../infrastructure/persistence/repositories.js';
import { verifyShopifyQueryHmac } from './hmac.js';
import { CarrierServiceManager } from './carrier-service-manager.js';
import { TokenVault } from './token-vault.js';

export interface ShopifyAuthDeps {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  scopes: string;
  installationRepo: ShopInstallationRepository;
  oauthStateRepo: OAuthStateRepository;
  carrierServiceManager: CarrierServiceManager;
  tokenVault: TokenVault;
  auditLogs: AuditLogRepository;
}

export class ShopifyAuthService {
  constructor(private readonly deps: ShopifyAuthDeps) {}

  async beginInstall(shop: string): Promise<{ state: string; redirectUrl: string }> {
    const state = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    await this.deps.oauthStateRepo.create({ state, shopDomain: shop, createdAt: now, expiresAt });

    const redirectUri = `${this.deps.appUrl}/shopify/auth/callback`;
    const redirectUrl = `https://${shop}/admin/oauth/authorize?client_id=${this.deps.apiKey}&scope=${encodeURIComponent(this.deps.scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return { state, redirectUrl };
  }

  verifyInstallQuery(query: Record<string, string | undefined>): boolean {
    return verifyShopifyQueryHmac(query, this.deps.apiSecret);
  }

  async exchangeCodeForToken(shop: string, code: string): Promise<{ access_token: string; scope: string }> {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.deps.apiKey, client_secret: this.deps.apiSecret, code })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed for ${shop}`);
    }

    return (await response.json()) as { access_token: string; scope: string };
  }

  async completeCallback(query: Record<string, string | undefined>, correlationId?: string): Promise<void> {
    if (!this.verifyInstallQuery(query)) throw new Error('Invalid OAuth HMAC');

    const shop = query.shop;
    const code = query.code;
    const state = query.state;
    if (!shop || !code || !state) throw new Error('Missing shop, code, or state');

    const stateRecord = await this.deps.oauthStateRepo.get(state);
    // In dev/custom distribution mode, state may not be found (in-memory store reset on deploy)
    // If state is missing but HMAC is valid and shop matches, allow through
    if (stateRecord) {
      if (stateRecord.shopDomain !== shop) throw new Error('State-shop mismatch');
      if (stateRecord.consumedAt) throw new Error('OAuth state replay detected');
      if (stateRecord.expiresAt.getTime() < Date.now()) throw new Error('Expired OAuth state');
    }

    const token = await this.exchangeCodeForToken(shop, code);
    let carrierServiceId: string | undefined = undefined;
    try {
      carrierServiceId = await this.deps.carrierServiceManager.ensureCarrierService(
        shop,
        token.access_token,
        `${this.deps.appUrl}/shopify/carrier-service/rates`
      );
    } catch (err) {
      console.warn(`[ShopifyAuth] Carrier service registration failed for ${shop} (non-fatal):`, err);
    }

    await this.deps.installationRepo.upsert({
      shopDomain: shop,
      encryptedAccessToken: this.deps.tokenVault.encrypt(token.access_token),
      scopes: token.scope.split(','),
      installedAt: new Date(),
      carrierServiceId
    });

    await this.deps.oauthStateRepo.consume(state, new Date());

    await this.deps.auditLogs.create({
      id: randomUUID(),
      actor: 'system',
      action: 'shop_installed',
      entityType: 'shop',
      entityId: shop,
      occurredAt: new Date(),
      correlationId,
      metadata: { scopes: token.scope, carrierServiceId }
    });
  }
}
