export class ShopifyGraphqlAdminClient {
  constructor(private readonly shopDomain: string, private readonly accessToken: string) {}

  async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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

    const body = (await response.json()) as { errors?: Array<{ message: string }> } & T;
    if (body.errors?.length) {
      throw new Error(body.errors.map((e) => e.message).join('; '));
    }

    return body as T;
  }
}
