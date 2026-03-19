import { randomUUID } from 'node:crypto';
import { verifyShopifyQueryHmac } from './hmac.js';
export class ShopifyAuthService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async beginInstall(shop) {
        const state = randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
        await this.deps.oauthStateRepo.create({ state, shopDomain: shop, createdAt: now, expiresAt });
        const redirectUri = `${this.deps.appUrl}/shopify/auth/callback`;
        const redirectUrl = `https://${shop}/admin/oauth/authorize?client_id=${this.deps.apiKey}&scope=${encodeURIComponent(this.deps.scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        return { state, redirectUrl };
    }
    verifyInstallQuery(query) {
        return verifyShopifyQueryHmac(query, this.deps.apiSecret);
    }
    async exchangeCodeForToken(shop, code) {
        const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: this.deps.apiKey, client_secret: this.deps.apiSecret, code })
        });
        if (!response.ok) {
            throw new Error(`Token exchange failed for ${shop}`);
        }
        return (await response.json());
    }
    async completeCallback(query, correlationId) {
        if (!this.verifyInstallQuery(query))
            throw new Error('Invalid OAuth HMAC');
        const shop = query.shop;
        const code = query.code;
        const state = query.state;
        if (!shop || !code || !state)
            throw new Error('Missing shop, code, or state');
        const stateRecord = await this.deps.oauthStateRepo.get(state);
        if (!stateRecord)
            throw new Error('Unknown OAuth state');
        if (stateRecord.shopDomain !== shop)
            throw new Error('State-shop mismatch');
        if (stateRecord.consumedAt)
            throw new Error('OAuth state replay detected');
        if (stateRecord.expiresAt.getTime() < Date.now())
            throw new Error('Expired OAuth state');
        const token = await this.exchangeCodeForToken(shop, code);
        const carrierServiceId = await this.deps.carrierServiceManager.ensureCarrierService(shop, token.access_token, `${this.deps.appUrl}/shopify/carrier-service/rates`);
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
