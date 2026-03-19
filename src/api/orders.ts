/**
 * Style.re Shopify App — Customer-facing API Routes
 * Orders, Payments, Stores, Chat
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'pending' | 'confirmed' | 'assigned' | 'picked_up'
  | 'in_transit' | 'delivered' | 'cancelled' | 'failed';

interface CustomerOrder {
  id: string;
  serviceType: 'logo_pickup' | 'item_delivery';
  status: OrderStatus;
  pickupAddress: AddressInput;
  dropoffAddress: AddressInput;
  items: Array<{ name: string; quantity: number; description?: string }>;
  contact: { name: string; phone: string; email: string };
  notes?: string;
  pricing: PricingQuote;
  paymentIntentId?: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AddressInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  unit?: string;
}

interface PricingQuote {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  estimatedMinutes: number;
}

interface ChatMessage {
  id: string;
  orderId: string;
  sender: 'customer' | 'driver' | 'system';
  message: string;
  timestamp: string;
}

// ─── In-memory store (replace with DB in prod) ────────────────────────────────
// In production, wire to PostgreSQL via the existing infrastructure

const ordersStore = new Map<string, CustomerOrder>();
const chatStore = new Map<string, ChatMessage[]>();

// ─── Pricing logic ────────────────────────────────────────────────────────────

function calculatePricing(serviceType: string): PricingQuote {
  const deliveryFee = serviceType === 'logo_pickup' ? 6.99 : 8.99;
  const serviceFee = 1.99;
  const tax = Math.round((deliveryFee + serviceFee) * 0.08 * 100) / 100;
  const total = Math.round((deliveryFee + serviceFee + tax) * 100) / 100;
  const estimatedMinutes = serviceType === 'logo_pickup' ? 35 : 50;

  return { subtotal: 0, deliveryFee, serviceFee, tax, total, estimatedMinutes };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createOrdersRouter(): Router {
  const router = Router();

  // POST /api/orders/create
  router.post('/orders/create', (req: Request, res: Response) => {
    try {
      const { serviceType, pickupAddress, dropoffAddress, items, contact, notes } = req.body;

      if (!serviceType || !pickupAddress || !dropoffAddress || !contact) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const id = 'SR-' + randomUUID().split('-')[0].toUpperCase();
      const pricing = calculatePricing(serviceType);
      const now = new Date().toISOString();

      const order: CustomerOrder = {
        id,
        serviceType,
        status: 'pending',
        pickupAddress,
        dropoffAddress,
        items: items ?? [],
        contact,
        notes,
        pricing,
        createdAt: now,
        updatedAt: now,
      };

      ordersStore.set(id, order);

      // Add welcome system message
      chatStore.set(id, [{
        id: randomUUID(),
        orderId: id,
        sender: 'system',
        message: 'Your Style.re order has been created. A courier will be assigned shortly.',
        timestamp: now,
      }]);

      return res.status(201).json(order);
    } catch (err) {
      console.error('Order creation error:', err);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // GET /api/orders/active — must be before /:id
  router.get('/orders/active', (_req: Request, res: Response) => {
    const activeStatuses: OrderStatus[] = ['pending', 'confirmed', 'assigned', 'picked_up', 'in_transit'];
    const active = Array.from(ordersStore.values())
      .filter((o) => activeStatuses.includes(o.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json(active);
  });

  // GET /api/orders/:id
  router.get('/orders/:id', (req: Request, res: Response) => {
    const order = ordersStore.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json(order);
  });

  // GET /api/orders/:id/tracking
  router.get('/orders/:id/tracking', (req: Request, res: Response) => {
    const order = ordersStore.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const timeline = [
      {
        status: 'pending',
        timestamp: order.createdAt,
        description: 'Order placed and payment confirmed',
      },
    ];

    if (['confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered'].includes(order.status)) {
      timeline.push({
        status: 'confirmed',
        timestamp: new Date(new Date(order.createdAt).getTime() + 2 * 60000).toISOString(),
        description: 'Order confirmed by Style.re',
      });
    }

    if (['assigned', 'picked_up', 'in_transit', 'delivered'].includes(order.status)) {
      timeline.push({
        status: 'assigned',
        timestamp: new Date(new Date(order.createdAt).getTime() + 5 * 60000).toISOString(),
        description: 'Style.re courier assigned to your order',
      });
    }

    if (['picked_up', 'in_transit', 'delivered'].includes(order.status)) {
      timeline.push({
        status: 'picked_up',
        timestamp: new Date(new Date(order.createdAt).getTime() + 20 * 60000).toISOString(),
        description: 'Items picked up from location',
      });
    }

    if (['in_transit', 'delivered'].includes(order.status)) {
      timeline.push({
        status: 'in_transit',
        timestamp: new Date(new Date(order.createdAt).getTime() + 25 * 60000).toISOString(),
        description: 'Courier on the way to delivery address',
      });
    }

    if (order.status === 'delivered') {
      timeline.push({
        status: 'delivered',
        timestamp: order.updatedAt,
        description: 'Successfully delivered',
      });
    }

    return res.json({
      orderId: order.id,
      status: order.status,
      driverName: ['assigned', 'picked_up', 'in_transit'].includes(order.status)
        ? 'Style.re Courier'
        : undefined,
      estimatedMinutes: order.status === 'in_transit'
        ? Math.max(5, order.pricing.estimatedMinutes - 30)
        : order.status === 'pending' || order.status === 'confirmed'
        ? order.pricing.estimatedMinutes
        : undefined,
      timeline,
    });
  });

  // GET /api/orders/:id/chat
  router.get('/orders/:id/chat', (req: Request, res: Response) => {
    const messages = chatStore.get(req.params.id) ?? [];
    return res.json(messages);
  });

  // POST /api/orders/:id/chat
  router.post('/orders/:id/chat', (req: Request, res: Response) => {
    const { message, sender = 'customer' } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const msg: ChatMessage = {
      id: randomUUID(),
      orderId: req.params.id,
      sender,
      message,
      timestamp: new Date().toISOString(),
    };

    const existing = chatStore.get(req.params.id) ?? [];
    chatStore.set(req.params.id, [...existing, msg]);

    return res.status(201).json(msg);
  });

  return router;
}

// ─── Payments Router ──────────────────────────────────────────────────────────

export function createPaymentsRouter(): Router {
  const router = Router();

  // POST /api/payments/intent
  router.post('/payments/intent', async (req: Request, res: Response) => {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'orderId and amount required' });
    }

    try {
      // Initialize Stripe with secret key from env
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        // Return mock intent for development
        const mockSecret = `pi_mock_${randomUUID().replace(/-/g, '')}_secret_${randomUUID().replace(/-/g, '')}`;
        return res.json({
          clientSecret: mockSecret,
          paymentIntentId: `pi_mock_${randomUUID().replace(/-/g, '')}`,
          amount,
        });
      }

      // Dynamic import to avoid top-level issues if stripe not installed
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' as never });

      const amountCents = Math.round(amount * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: { orderId, source: 'stylere-shopify-app' },
      });

      return res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
      });
    } catch (err) {
      console.error('Stripe PaymentIntent error:', err);
      return res.status(500).json({ error: 'Failed to create payment intent' });
    }
  });

  // POST /api/payments/confirm
  router.post('/payments/confirm', async (req: Request, res: Response) => {
    const { paymentIntentId, orderId } = req.body;
    if (!paymentIntentId || !orderId) {
      return res.status(400).json({ error: 'paymentIntentId and orderId required' });
    }

    try {
      // Update order status to confirmed
      const order = ordersStore.get(orderId);
      if (order) {
        order.status = 'confirmed';
        order.paymentIntentId = paymentIntentId;
        order.updatedAt = new Date().toISOString();
        ordersStore.set(orderId, order);

        // Simulate courier assignment after 5s in background
        setTimeout(() => {
          const o = ordersStore.get(orderId);
          if (o && o.status === 'confirmed') {
            o.status = 'assigned';
            o.updatedAt = new Date().toISOString();
            ordersStore.set(orderId, o);
          }
        }, 5000);
      }

      return res.json({ success: true, orderId });
    } catch (err) {
      console.error('Payment confirm error:', err);
      return res.status(500).json({ error: 'Failed to confirm payment' });
    }
  });

  return router;
}

// ─── Stores Router ────────────────────────────────────────────────────────────

export function createStoresRouter(): Router {
  const router = Router();

  // GET /api/stores/nearby
  router.get('/stores/nearby', (req: Request, res: Response) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

    // In production, query Style.re backend: GET https://api.stylere.app/api/stores
    // For now, return mock stores near Dallas
    const stores = [
      {
        id: 'store-1',
        name: 'Nordstrom NorthPark',
        address: { street: '100 NorthPark Center', city: 'Dallas', state: 'TX', zip: '75225', country: 'US' },
        distance: 2.3,
        phone: '+12145559001',
      },
      {
        id: 'store-2',
        name: 'Neiman Marcus Downtown',
        address: { street: '1618 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
        distance: 1.1,
        phone: '+12145559002',
      },
      {
        id: 'store-3',
        name: 'Madewell Mockingbird',
        address: { street: '5307 E Mockingbird Ln', city: 'Dallas', state: 'TX', zip: '75206', country: 'US' },
        distance: 3.7,
        phone: '+12145559003',
      },
    ];

    return res.json(stores);
  });

  return router;
}
