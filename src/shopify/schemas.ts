import { z } from 'zod';

/** Inbound delivery status update from Storree/dispatch provider */
export const deliveryStatusWebhookSchema = z.object({
  dispatchId: z.string(),
  externalReference: z.string(), // maps to shopify order id or job id
  status: z.string(),
  providerStatus: z.string().optional(),
  eta: z.string().datetime({ offset: true }).optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional()
});

export const carrierRateRequestSchema = z.object({
  rate: z.object({
    origin: z.object({
      latitude: z.number(),
      longitude: z.number()
    }),
    destination: z.object({
      latitude: z.number(),
      longitude: z.number()
    }),
    price: z.string().optional(),
    currency: z.string().default('USD')
  }),
  shop: z.object({
    domain: z.string()
  })
});

export const shopifyOrderWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  shipping_lines: z.array(
    z.object({
      code: z.string().nullable().optional(),
      title: z.string().optional()
    })
  ),
  shipping_address: z.object({
    latitude: z.number(),
    longitude: z.number()
  }),
  line_items: z.array(
    z.object({
      sku: z.string().optional().default('unknown'),
      quantity: z.number(),
      name: z.string()
    })
  )
});
