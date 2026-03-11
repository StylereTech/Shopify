import { ShopifyGraphqlAdminClient } from './graphql-admin-client.js';

export interface ShopifyLocation {
  id: string;
  name: string;
  address1?: string;
  city?: string;
  country?: string;
  active: boolean;
}

export class ShopifyLocationService {
  async listLocations(shopDomain: string, accessToken: string): Promise<ShopifyLocation[]> {
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

    const response = await client.query<{
      data: {
        locations: {
          nodes: Array<{
            id: string;
            name: string;
            isActive: boolean;
            address?: { address1?: string; city?: string; country?: string };
          }>;
        };
      };
    }>(query, {});

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
