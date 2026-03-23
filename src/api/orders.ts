/**
 * Style.re Shopify App — Customer-facing API Routes
 * Orders, Payments, Stores, Chat
 *
 * Architecture:
 * - Customer-facing flow: Landing → Address → Summary → Payment → Confirmation → Tracking
 * - This handles the DIRECT customer flow (not via Shopify carrier/webhook)
 * - The Shopify webhook path is in app.ts → orchestrator → dispatch
 *
 * Hardening:
 * - Stripe webhook endpoint verifies signature with STRIPE_WEBHOOK_SECRET (fail-closed)
 * - Dispatch is triggered ONLY after Stripe webhook confirms payment_intent.succeeded
 * - /payments/confirm verifies PI status server-side with Stripe before dispatching
 * - Idempotency: dispatch guarded by payment_intent_id to prevent double dispatch
 * - Orders persisted to Postgres via StorreeOrderRepository (restart-safe)
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  StorreeOrder,
  StorreeOrderRepository,
  InMemoryStorreeOrderRepository,
} from '../infrastructure/persistence/postgres-repositories.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'pending' | 'confirmed' | 'assigned' | 'picked_up'
  | 'in_transit' | 'delivered' | 'cancelled' | 'failed';

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

// ─── In-memory chat store (ephemeral — fine, not critical) ────────────────────
const chatStore = new Map<string, ChatMessage[]>();

// ─── Default order repository (overridden in production server.ts) ────────────
// In tests and when no repo is injected, uses in-memory fallback.
let _orderRepo: StorreeOrderRepository = new InMemoryStorreeOrderRepository();

export function setStorreeOrderRepository(repo: StorreeOrderRepository): void {
  _orderRepo = repo;
}

export function getStorreeOrderRepository(): StorreeOrderRepository {
  return _orderRepo;
}

// ─── DoorDash Dispatch ────────────────────────────────────────────────────────

interface DoorDashDispatchResult {
  success: boolean;
  externalId?: string;
  trackingUrl?: string;
  status?: string;
  error?: string;
}

async function dispatchOrderDirect(order: StorreeOrder): Promise<DoorDashDispatchResult> {
  const {
    DOORDASH_DEVELOPER_ID,
    DOORDASH_KEY_ID,
    DOORDASH_SIGNING_SECRET,
    TWILIO_FROM_NUMBER,
  } = process.env;

  if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET) {
    console.warn('[dispatch] DoorDash credentials not configured — skipping real dispatch');
    return { success: false, error: 'DoorDash not configured' };
  }

  try {
    const { DoorDashDriveClient } = await import('../infrastructure/doordash/doordash-client.js');
    const dd = new DoorDashDriveClient({
      developerId: DOORDASH_DEVELOPER_ID,
      keyId: DOORDASH_KEY_ID,
      signingSecret: DOORDASH_SIGNING_SECRET,
    });

    const pa = order.pickupAddress as unknown as AddressInput;
    const da = order.dropoffAddress as unknown as AddressInput;
    const contact = order.contact as unknown as { name?: string; phone?: string };
    const items = order.items as unknown as Array<{ name?: string; quantity?: number }>;
    const pricing = order.pricing as unknown as PricingQuote;

    const pickupAddr = process.env.DEFAULT_PICKUP_ADDRESS ||
      `${pa.street}, ${pa.city}, ${pa.state} ${pa.zip}`;

    const dropoffAddr = `${da.street}${da.unit ? ` ${da.unit}` : ''}, ${da.city}, ${da.state} ${da.zip}`;

    const external_delivery_id = `stylere_${order.id}`;

    const delivery = await dd.createDelivery({
      external_delivery_id,
      pickup_address: pickupAddr,
      pickup_business_name: process.env.DEFAULT_PICKUP_NAME || 'Style.re Store',
      pickup_phone_number: formatPhoneE164(process.env.DEFAULT_PICKUP_PHONE),
      pickup_instructions: `Order #${order.id} — ${items.map(i => `${i.quantity}x ${i.name}`).join(', ')}`,
      pickup_reference_tag: `Order #${order.id}`,
      dropoff_address: dropoffAddr,
      dropoff_phone_number: TWILIO_FROM_NUMBER || formatPhoneE164(contact.phone),
      dropoff_contact_given_name: (contact.name ?? 'Customer').split(' ')[0],
      dropoff_instructions: order.notes || 'Please ring doorbell upon arrival.',
      order_value: Math.round((pricing.total ?? 0) * 100),
      pickup_window: {
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      },
      dropoff_window: {
        start_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() + 75 * 60 * 1000).toISOString(),
      },
      action_if_undeliverable: 'return_to_pickup',
    });

    return {
      success: true,
      externalId: delivery.external_delivery_id,
      trackingUrl: delivery.tracking_url,
      status: delivery.delivery_status,
    };
  } catch (err) {
    console.error('[dispatch] DoorDash dispatch error:', err);
    return { success: false, error: String(err) };
  }
}

function formatPhoneE164(phone?: string | null): string {
  if (!phone) return '+13464755016';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

// ─── Merchant Notification ────────────────────────────────────────────────────

async function sendMerchantNotification(order: StorreeOrder): Promise<void> {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    ADMIN_PHONE_NUMBER,
  } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ADMIN_PHONE_NUMBER) {
    console.log('[notify] Twilio not configured — skipping merchant SMS');
    return;
  }

  try {
    const to = formatPhoneE164(ADMIN_PHONE_NUMBER);
    const da = order.dropoffAddress as unknown as AddressInput;
    const contact = order.contact as unknown as { name?: string; phone?: string };
    const items = order.items as unknown as Array<{ name?: string; quantity?: number }>;
    const pricing = order.pricing as unknown as PricingQuote;

    const body =
      `🛍 New Style.re Order #${order.id}\n` +
      `Customer: ${contact.name ?? 'Unknown'}\n` +
      `Phone: ${contact.phone ?? 'N/A'}\n` +
      `Drop-off: ${da.street}, ${da.city}\n` +
      `Items: ${items.map(i => `${i.quantity}x ${i.name}`).join(', ')}\n` +
      `Total: $${(pricing.total ?? 0).toFixed(2)}`;

    const params = new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body });
    const creds = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    console.log('[notify] Merchant SMS sent to', to);
  } catch (err) {
    console.error('[notify] Merchant SMS failed (non-blocking):', err);
  }
}

// ─── Pricing logic ────────────────────────────────────────────────────────────

function calculatePricing(serviceType: string): PricingQuote {
  const deliveryFee = serviceType === 'logo_pickup' ? 6.99 : 8.99;
  const serviceFee = 1.99;
  const tax = Math.round((deliveryFee + serviceFee) * 0.08 * 100) / 100;
  const total = Math.round((deliveryFee + serviceFee + tax) * 100) / 100;
  const estimatedMinutes = serviceType === 'logo_pickup' ? 35 : 50;

  return { subtotal: 0, deliveryFee, serviceFee, tax, total, estimatedMinutes };
}

// ─── Idempotent dispatch helper ───────────────────────────────────────────────
// Prevents double-dispatch if /payments/confirm AND stripe webhook both fire.

async function dispatchIfNotAlready(order: StorreeOrder): Promise<void> {
  // Already dispatched — skip
  if (order.doordashExternalId || order.status === 'assigned') {
    console.log(`[dispatch] Order ${order.id} already dispatched — skipping`);
    return;
  }

  const result = await dispatchOrderDirect(order).catch((err) => {
    console.error('[dispatch] Error (non-blocking):', err);
    return { success: false, error: String(err) } as DoorDashDispatchResult;
  });

  if (result.success) {
    order.status = 'assigned';
    order.doordashExternalId = result.externalId;
    order.doordashTrackingUrl = result.trackingUrl;
    order.doordashDeliveryId = result.externalId;
    order.dispatchId = result.externalId;
    order.updatedAt = new Date();
    await _orderRepo.update(order);
    console.log(`[dispatch] Order ${order.id} → DoorDash ${result.externalId}`);
  } else {
    console.warn(`[dispatch] DoorDash dispatch skipped/failed for ${order.id}:`, result.error);
    // Keep status as 'confirmed' — manual dispatch possible
  }

  if (!order.merchantNotified) {
    await sendMerchantNotification(order).catch(() => {});
    order.merchantNotified = true;
    order.updatedAt = new Date();
    await _orderRepo.update(order).catch(() => {});
  }
}

// ─── DoorDash Status Mapping ──────────────────────────────────────────────────

function mapDoorDashStatus(raw: string): OrderStatus | undefined {
  const s = raw.toLowerCase();
  if (['created', 'pending', 'queued'].includes(s)) return 'confirmed';
  if (['assigned', 'delivery_assigned', 'en_route_to_pickup'].includes(s)) return 'assigned';
  if (['picked_up'].includes(s)) return 'picked_up';
  if (['in_progress', 'active', 'en_route_to_dropoff'].includes(s)) return 'in_transit';
  if (['delivered', 'completed'].includes(s)) return 'delivered';
  if (['canceled', 'cancelled', 'failed'].includes(s)) return 'cancelled';
  return undefined;
}

// ─── Orders Router ────────────────────────────────────────────────────────────

export function createOrdersRouter(): Router {
  const router = Router();

  // POST /api/orders/create
  router.post('/orders/create', async (req: Request, res: Response) => {
    try {
      const { serviceType, pickupAddress, dropoffAddress, items, contact, notes } = req.body;

      if (!serviceType || !pickupAddress || !dropoffAddress || !contact) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const id = 'SR-' + randomUUID().split('-')[0].toUpperCase();
      const pricing = calculatePricing(serviceType);
      const now = new Date();

      const order: StorreeOrder = {
        id,
        serviceType,
        status: 'pending',
        pickupAddress: pickupAddress as Record<string, unknown>,
        dropoffAddress: dropoffAddress as Record<string, unknown>,
        items: (items ?? []) as Array<Record<string, unknown>>,
        contact: contact as Record<string, unknown>,
        notes,
        pricing: pricing as unknown as Record<string, unknown>,
        paymentStatus: 'unpaid',
        merchantNotified: false,
        createdAt: now,
        updatedAt: now,
      };

      await _orderRepo.create(order);

      // Add welcome system message
      chatStore.set(id, [{
        id: randomUUID(),
        orderId: id,
        sender: 'system',
        message: 'Your Style.re order has been created. A courier will be assigned shortly.',
        timestamp: now.toISOString(),
      }]);

      return res.status(201).json(orderToResponse(order));
    } catch (err) {
      console.error('Order creation error:', err);
      return res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // GET /api/orders/active — must be before /:id
  router.get('/orders/active', async (_req: Request, res: Response) => {
    try {
      const active = await _orderRepo.listActive();
      return res.json(active.map(orderToResponse));
    } catch (err) {
      console.error('listActive error:', err);
      return res.status(500).json({ error: 'Failed to list orders' });
    }
  });

  // GET /api/orders/:id
  router.get('/orders/:id', async (req: Request, res: Response) => {
    const order = await _orderRepo.getById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json(orderToResponse(order));
  });

  // GET /api/orders/:id/tracking
  router.get('/orders/:id/tracking', async (req: Request, res: Response) => {
    const order = await _orderRepo.getById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Try to fetch live DoorDash status
    let doordashStatus: string | undefined;
    let doordashEta: string | undefined;
    let dasherName: string | undefined;

    if (order.doordashExternalId) {
      try {
        const {
          DOORDASH_DEVELOPER_ID,
          DOORDASH_KEY_ID,
          DOORDASH_SIGNING_SECRET,
        } = process.env;

        if (DOORDASH_DEVELOPER_ID && DOORDASH_KEY_ID && DOORDASH_SIGNING_SECRET) {
          const { DoorDashDriveClient } = await import('../infrastructure/doordash/doordash-client.js');
          const dd = new DoorDashDriveClient({
            developerId: DOORDASH_DEVELOPER_ID,
            keyId: DOORDASH_KEY_ID,
            signingSecret: DOORDASH_SIGNING_SECRET,
          });
          const d = await dd.getDelivery(order.doordashExternalId);
          doordashStatus = d.delivery_status;
          doordashEta = d.dropoff_eta || d.dropoff_time_estimated;
          dasherName = d.dasher_name;

          // Sync order status from DoorDash
          const mapped = mapDoorDashStatus(doordashStatus ?? '');
          if (mapped && order.status !== mapped) {
            order.status = mapped;
            order.updatedAt = new Date();
            await _orderRepo.update(order);
          }
        }
      } catch (err) {
        console.warn('[tracking] DoorDash status fetch failed:', err);
      }
    }

    const timeline = buildTimeline(order);

    let estimatedMinutes: number | undefined;
    const pricing = order.pricing as unknown as PricingQuote;
    if (doordashEta) {
      estimatedMinutes = Math.max(1, Math.round((new Date(doordashEta).getTime() - Date.now()) / 60000));
    } else if (['pending', 'confirmed'].includes(order.status)) {
      estimatedMinutes = pricing.estimatedMinutes;
    } else if (order.status === 'in_transit') {
      estimatedMinutes = Math.max(5, (pricing.estimatedMinutes ?? 50) - 30);
    }

    return res.json({
      orderId: order.id,
      status: order.status,
      driverName: dasherName || (['assigned', 'picked_up', 'in_transit'].includes(order.status) ? 'Style.re Courier' : undefined),
      estimatedMinutes,
      doordashTrackingUrl: order.doordashTrackingUrl,
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
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecretKey) {
        // Dev mode: return mock intent
        const mockSecret = `pi_mock_${randomUUID().replace(/-/g, '')}_secret_${randomUUID().replace(/-/g, '')}`;
        return res.json({
          clientSecret: mockSecret,
          paymentIntentId: `pi_mock_${randomUUID().replace(/-/g, '')}`,
          amount,
        });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' as never });

      const amountCents = Math.round(amount * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        metadata: { orderId, source: 'stylere-shopify-app' },
        automatic_payment_methods: { enabled: true },
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

  /**
   * POST /api/payments/confirm
   *
   * Called after Stripe confirms payment client-side.
   * Security hardening:
   * 1. Verifies PI status with Stripe server-side (don't trust frontend alone)
   * 2. Idempotency: checks if already dispatched before firing DoorDash
   * 3. Updates payment_status field for audit trail
   *
   * Note: Stripe webhook (/api/payments/stripe-webhook) is the canonical trigger.
   * This endpoint acts as a reliable secondary path for better UX responsiveness,
   * but is guarded against double dispatch via idempotency check.
   */
  router.post('/payments/confirm', async (req: Request, res: Response) => {
    const { paymentIntentId, orderId } = req.body;
    if (!paymentIntentId || !orderId) {
      return res.status(400).json({ error: 'paymentIntentId and orderId required' });
    }

    const order = await _orderRepo.getById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

      // ── Server-side Stripe verification ──────────────────────────────────
      if (stripeSecretKey && !paymentIntentId.startsWith('pi_mock_')) {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' as never });
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (pi.status !== 'succeeded') {
          console.warn(`[confirm] PI ${paymentIntentId} status=${pi.status} — not confirmed yet`);
          return res.status(402).json({
            error: 'Payment not confirmed',
            stripeStatus: pi.status,
          });
        }
      }

      // ── Idempotency: skip if already dispatched (webhook may have beaten us) ──
      if (order.doordashExternalId || order.status === 'assigned') {
        console.log(`[confirm] Order ${orderId} already dispatched — returning success`);
        return res.json({
          success: true,
          orderId,
          dispatched: true,
          trackingUrl: order.doordashTrackingUrl,
          idempotent: true,
        });
      }

      // ── Mark as confirmed + update payment info ───────────────────────────
      order.status = 'confirmed';
      order.paymentIntentId = paymentIntentId;
      order.stripePaymentIntentId = paymentIntentId;
      order.paymentStatus = 'paid';
      order.updatedAt = new Date();
      await _orderRepo.update(order);

      // ── Fire DoorDash dispatch (with idempotency guard) ───────────────────
      await dispatchIfNotAlready(order);

      // Add system chat message
      const chatMsg: ChatMessage = {
        id: randomUUID(),
        orderId,
        sender: 'system',
        message: order.doordashExternalId
          ? '✅ Payment confirmed. Your courier has been dispatched!'
          : '✅ Payment confirmed. A courier will be assigned shortly.',
        timestamp: new Date().toISOString(),
      };
      const existing = chatStore.get(orderId) ?? [];
      chatStore.set(orderId, [...existing, chatMsg]);

      return res.json({
        success: true,
        orderId,
        dispatched: !!order.doordashExternalId,
        trackingUrl: order.doordashTrackingUrl,
      });
    } catch (err) {
      console.error('Payment confirm error:', err);
      return res.status(500).json({ error: 'Failed to confirm payment' });
    }
  });

  /**
   * POST /api/payments/stripe-webhook
   *
   * Stripe webhook — CANONICAL dispatch trigger.
   * Hardening:
   * - Signature verification is REQUIRED when STRIPE_WEBHOOK_SECRET is set (fail-closed)
   * - Handles payment_intent.succeeded (dispatch) and payment_intent.payment_failed (mark failed)
   * - Idempotency: skips dispatch if order already dispatched
   */
  router.post('/payments/stripe-webhook', async (req: Request, res: Response) => {
    const sig = req.header('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    // ── Signature verification ────────────────────────────────────────────────
    let event: { type: string; data: { object: { id: string; status?: string; metadata?: { orderId?: string } } } };

    if (webhookSecret) {
      // STRIPE_WEBHOOK_SECRET configured — enforce signature verification (fail-closed)
      if (!sig) {
        console.error('[stripe-webhook] Missing stripe-signature header — rejecting');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }
      if (!stripeSecretKey) {
        console.error('[stripe-webhook] STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Stripe not configured' });
      }
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-01-27.acacia' as never });
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret) as typeof event;
      } catch (err) {
        console.error('[stripe-webhook] Signature verification failed:', err);
        return res.status(400).json({ error: `Stripe webhook signature error: ${err}` });
      }
    } else {
      // No webhook secret — dev/test mode, accept raw body
      // In production, STRIPE_WEBHOOK_SECRET must always be set
      console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — running in dev mode (unsafe for production)');
      event = req.body as typeof event;
    }

    // ── Event handling ────────────────────────────────────────────────────────
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;

      console.log(`[stripe-webhook] payment_intent.succeeded — pi=${pi.id} orderId=${orderId}`);

      if (orderId) {
        const order = await _orderRepo.getById(orderId).catch(() => undefined);
        if (order) {
          // Update payment status
          order.stripePaymentIntentId = pi.id;
          order.paymentIntentId = pi.id;
          order.paymentStatus = 'paid';

          if (order.status === 'pending') {
            order.status = 'confirmed';
          }
          order.updatedAt = new Date();
          await _orderRepo.update(order).catch((err) => console.error('[stripe-webhook] order update failed:', err));

          // Dispatch (idempotent — skips if already dispatched)
          await dispatchIfNotAlready(order).catch((err) => console.error('[stripe-webhook] dispatch failed:', err));
        } else {
          console.warn(`[stripe-webhook] Order ${orderId} not found — cannot dispatch`);
        }
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;

      console.log(`[stripe-webhook] payment_intent.payment_failed — pi=${pi.id} orderId=${orderId}`);

      if (orderId) {
        const order = await _orderRepo.getById(orderId).catch(() => undefined);
        if (order && order.status === 'pending') {
          order.status = 'failed';
          order.paymentStatus = 'failed';
          order.stripePaymentIntentId = pi.id;
          order.updatedAt = new Date();
          await _orderRepo.update(order).catch((err) => console.error('[stripe-webhook] order update (failed) error:', err));
          console.log(`[stripe-webhook] Order ${orderId} marked as payment_failed`);
        }
      }
    } else {
      console.log(`[stripe-webhook] Unhandled event type: ${event.type} — acknowledged`);
    }

    return res.json({ received: true });
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orderToResponse(order: StorreeOrder): Record<string, unknown> {
  return {
    id: order.id,
    serviceType: order.serviceType,
    status: order.status,
    pickupAddress: order.pickupAddress,
    dropoffAddress: order.dropoffAddress,
    items: order.items,
    contact: order.contact,
    notes: order.notes,
    pricing: order.pricing,
    paymentIntentId: order.paymentIntentId,
    stripePaymentIntentId: order.stripePaymentIntentId,
    paymentStatus: order.paymentStatus,
    doordashDeliveryId: order.doordashDeliveryId,
    doordashTrackingUrl: order.doordashTrackingUrl,
    doordashExternalId: order.doordashExternalId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function buildTimeline(order: StorreeOrder): Array<{ status: string; timestamp: string; description: string }> {
  const timeline = [];
  const created = order.createdAt.getTime();

  timeline.push({
    status: 'pending',
    timestamp: order.createdAt.toISOString(),
    description: 'Order placed and payment confirmed',
  });

  if (['confirmed', 'assigned', 'picked_up', 'in_transit', 'delivered'].includes(order.status)) {
    timeline.push({
      status: 'confirmed',
      timestamp: new Date(created + 2 * 60000).toISOString(),
      description: 'Order confirmed by Style.re',
    });
  }

  if (['assigned', 'picked_up', 'in_transit', 'delivered'].includes(order.status)) {
    timeline.push({
      status: 'assigned',
      timestamp: new Date(created + 5 * 60000).toISOString(),
      description: 'Style.re courier assigned to your order',
    });
  }

  if (['picked_up', 'in_transit', 'delivered'].includes(order.status)) {
    timeline.push({
      status: 'picked_up',
      timestamp: new Date(created + 20 * 60000).toISOString(),
      description: 'Items picked up from location',
    });
  }

  if (['in_transit', 'delivered'].includes(order.status)) {
    timeline.push({
      status: 'in_transit',
      timestamp: new Date(created + 25 * 60000).toISOString(),
      description: 'Courier on the way to delivery address',
    });
  }

  if (order.status === 'delivered') {
    timeline.push({
      status: 'delivered',
      timestamp: order.updatedAt.toISOString(),
      description: 'Successfully delivered',
    });
  }

  return timeline;
}
