import { ShopifyGraphqlAdminClient } from './graphql-admin-client.js';
export class ShopifyLocationService {
    async listLocations(shopDomain, accessToken) {
        const client = new ShopifyGraphqlAdminClient(shopDomain, accessToken);
        const query = `
      query Locations {
        locations(first: 20) {
          nodes {
            id
            name
            isActive
            address { address1 city country }
          }
        }
      }
    `;
        const response = await client.query(query, {});
        return response.data.locations.nodes.map((node) => ({
            id: node.id,
            name: node.name,
            active: node.isActive,
            address1: node.address?.address1,
            city: node.address?.city,
            country: node.address?.country
        }));
    }
}
