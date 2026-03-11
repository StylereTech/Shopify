import { z } from 'zod';

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
