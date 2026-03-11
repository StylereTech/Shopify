import { ShopifyGraphqlAdminClient } from './graphql-admin-client.js';

export interface CarrierServicePrerequisiteStatus {
  planName?: string;
  shopifyPlus?: boolean;
  partnerDevelopment?: boolean;
  eligibilityUnknown: boolean;
  note: string;
}

export class CarrierServiceManager {
  async ensureCarrierService(shopDomain: string, accessToken: string, callbackUrl: string): Promise<string> {
    const client = new ShopifyGraphqlAdminClient(shopDomain, accessToken);

    const findQuery = `
      query CarrierServices { deliveryCarrierServices(first: 20) { nodes { id name callbackUrl active } } }
    `;

    const existing = await client.query<{ data: { deliveryCarrierServices: { nodes: Array<{ id: string; name: string; callbackUrl: string }> } } }>(findQuery, {});
    const current = existing.data.deliveryCarrierServices.nodes.find((n) => n.name === 'Storree Local Delivery');

    if (current) {
      const updateMutation = `
        mutation UpdateCarrier($id: ID!, $callbackUrl: URL!) {
          deliveryCarrierServiceUpdate(id: $id, callbackUrl: $callbackUrl, active: true) {
            carrierService { id }
            userErrors { field message }
          }
        }
      `;
      const updated = await client.query<{ data: { deliveryCarrierServiceUpdate: { carrierService: { id: string } | null } } }>(
        updateMutation,
        { id: current.id, callbackUrl }
      );
      return updated.data.deliveryCarrierServiceUpdate.carrierService?.id ?? current.id;
    }

    const createMutation = `
      mutation CreateCarrier($name: String!, $callbackUrl: URL!) {
        deliveryCarrierServiceCreate(name: $name, callbackUrl: $callbackUrl, active: true) {
          carrierService { id }
          userErrors { field message }
        }
      }
    `;

    const created = await client.query<{ data: { deliveryCarrierServiceCreate: { carrierService: { id: string } | null } } }>(
      createMutation,
      { name: 'Storree Local Delivery', callbackUrl }
    );

    const id = created.data.deliveryCarrierServiceCreate.carrierService?.id;
    if (!id) throw new Error('Failed to create carrier service');
    return id;
  }

  async checkPrerequisites(shopDomain: string, accessToken: string): Promise<CarrierServicePrerequisiteStatus> {
    const client = new ShopifyGraphqlAdminClient(shopDomain, accessToken);
    try {
      const response = await client.query<{
        data: {
          shop: {
            plan?: {
              displayName?: string;
              shopifyPlus?: boolean;
              partnerDevelopment?: boolean;
            };
          };
        };
      }>(
        `
        query CarrierPrereq {
          shop {
            plan {
              displayName
              shopifyPlus
              partnerDevelopment
            }
          }
        }
      `,
        {}
      );

      const plan = response.data.shop.plan;
      return {
        planName: plan?.displayName,
        shopifyPlus: plan?.shopifyPlus,
        partnerDevelopment: plan?.partnerDevelopment,
        eligibilityUnknown: false,
        note:
          'Carrier service creation can fail if the store does not meet Shopify carrier-service prerequisites; verify plan/features on the target store.'
      };
    } catch {
      return {
        eligibilityUnknown: true,
        note:
          'Could not verify store prerequisites from GraphQL response. Validate carrier-service prerequisites directly in the target store before launch.'
      };
    }
  }
}
