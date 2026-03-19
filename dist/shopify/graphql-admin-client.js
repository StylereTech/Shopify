export class ShopifyGraphqlAdminClient {
    shopDomain;
    accessToken;
    constructor(shopDomain, accessToken) {
        this.shopDomain = shopDomain;
        this.accessToken = accessToken;
    }
    async query(query, variables) {
        const response = await fetch(`https://${this.shopDomain}/admin/api/2025-01/graphql.json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': this.accessToken
            },
            body: JSON.stringify({ query, variables })
        });
        if (!response.ok) {
            throw new Error(`Shopify GraphQL failed (${response.status})`);
        }
        const body = (await response.json());
        if (body.errors?.length) {
            throw new Error(body.errors.map((e) => e.message).join('; '));
        }
        return body;
    }
}
