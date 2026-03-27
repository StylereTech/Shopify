import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { createPostgresPool } from '../infrastructure/db/postgres.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface Merchant {
  id: string;
  email: string;
  password_hash?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  store_name: string;
  store_address?: string | null;
  store_phone?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  onboarding_path: string;
  shopify_shop_domain?: string | null;
  plan: string;
  plan_status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AuthenticatedRequest extends Request {
  merchant?: Merchant;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPool() {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/storree_shopify';
  return createPostgresPool(url);
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function getJwtSecret(): string {
  return process.env.MERCHANT_JWT_SECRET ?? 'dev-merchant-jwt-secret-change-in-production';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function signJwt(merchantId: string): string {
  return jwt.sign({ sub: merchantId, type: 'merchant' }, getJwtSecret(), { expiresIn: '7d' });
}

// ── Auth Middleware ──────────────────────────────────────────────────────────

export async function merchantAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; type: string };
    if (payload.type !== 'merchant') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }

    const pool = getPool();
    const tokenHash = hashToken(token);

    // Check session is valid (not logged out, not expired)
    const sessionResult = await pool.query(
      `SELECT id FROM merchant_sessions WHERE merchant_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [payload.sub, tokenHash]
    );
    await pool.end();

    if (sessionResult.rows.length === 0) {
      res.status(401).json({ error: 'Session expired or logged out' });
      return;
    }

    // Fetch merchant
    const pool2 = getPool();
    const merchantResult = await pool2.query<Merchant>(
      `SELECT * FROM merchants WHERE id = $1`,
      [payload.sub]
    );
    await pool2.end();

    if (merchantResult.rows.length === 0) {
      res.status(401).json({ error: 'Merchant not found' });
      return;
    }

    req.merchant = merchantResult.rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireActivePlan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.merchant) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.merchant.plan_status !== 'active') {
    res.status(403).json({
      error: 'Active subscription required',
      plan_status: req.merchant.plan_status,
      upgrade_url: '/merchant/pricing'
    });
    return;
  }
  next();
}

// ── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = {
  access: {
    id: 'access',
    name: 'Stowry Access',
    price_cents: 10000,
    price_display: '$100/month',
    features: [
      'Merchant dashboard',
      'Order tracking',
      'Order history',
      'Basic reporting',
      'Basic support',
      'Manual order creation'
    ]
  },
  growth: {
    id: 'growth',
    name: 'Stowry Growth',
    price_cents: 20000,
    price_display: '$200/month',
    features: [
      'Everything in Access',
      'Priority dispatch',
      'Priority drivers',
      'Advanced analytics',
      'Multi-user staff accounts',
      'Premium support',
      'Preferred onboarding'
    ],
    popular: true
  }
};

// ── Router ───────────────────────────────────────────────────────────────────

export function createMerchantRouter(): express.Router {
  const router = express.Router();

  // ── GET /merchant/plans ─────────────────────────────────────────────────
  router.get('/merchant/plans', (_req, res) => {
    res.json({ plans: Object.values(PLANS) });
  });

  // ── POST /merchant/auth/register ────────────────────────────────────────
  router.post('/merchant/auth/register', async (req, res) => {
    try {
      const { email, password, first_name, last_name, store_name, city, state, plan } = req.body as {
        email?: string;
        password?: string;
        first_name?: string;
        last_name?: string;
        store_name?: string;
        city?: string;
        state?: string;
        plan?: string;
      };

      if (!email || !password || !store_name) {
        return res.status(400).json({ error: 'email, password, and store_name are required' });
      }

      const selectedPlan = (plan === 'growth' ? 'growth' : 'access') as keyof typeof PLANS;
      const password_hash = await bcrypt.hash(password, 10);
      const pool = getPool();

      // Check duplicate email
      const existing = await pool.query(`SELECT id FROM merchants WHERE email = $1`, [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        await pool.end();
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Create merchant
      const result = await pool.query<Merchant>(
        `INSERT INTO merchants (id, email, password_hash, first_name, last_name, store_name, city, state, plan, plan_status, onboarding_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', 'direct')
         RETURNING *`,
        [randomUUID(), email.toLowerCase(), password_hash, first_name ?? null, last_name ?? null, store_name, city ?? null, state ?? null, selectedPlan]
      );
      await pool.end();

      const merchant = result.rows[0];

      // Create Stripe checkout session
      const stripe = getStripe();
      let checkoutUrl: string | null = null;

      if (stripe) {
        const priceId = selectedPlan === 'growth'
          ? process.env.MERCHANT_STRIPE_PRICE_GROWTH
          : process.env.MERCHANT_STRIPE_PRICE_ACCESS;

        if (priceId) {
          const appUrl = process.env.APP_URL ?? 'https://api-production-653e.up.railway.app';
          const frontendUrl = process.env.FRONTEND_URL ?? 'https://stylere-shopify-delivery.vercel.app';

          // Create or find Stripe customer
          const customer = await stripe.customers.create({
            email: merchant.email,
            name: `${first_name ?? ''} ${last_name ?? ''}`.trim() || store_name,
            metadata: { merchant_id: merchant.id, store_name }
          });

          // Save Stripe customer ID
          const pool2 = getPool();
          await pool2.query(`UPDATE merchants SET stripe_customer_id = $1 WHERE id = $2`, [customer.id, merchant.id]);
          await pool2.end();

          const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${frontendUrl}/shopify/merchant/dashboard?checkout=success`,
            cancel_url: `${frontendUrl}/shopify/merchant/pricing?checkout=cancelled`,
            metadata: { merchant_id: merchant.id, plan: selectedPlan },
            subscription_data: {
              metadata: { merchant_id: merchant.id, plan: selectedPlan }
            }
          });
          checkoutUrl = session.url;
        }
      }

      return res.status(201).json({
        merchant: {
          id: merchant.id,
          email: merchant.email,
          first_name: merchant.first_name,
          last_name: merchant.last_name,
          store_name: merchant.store_name,
          plan: merchant.plan,
          plan_status: merchant.plan_status
        },
        checkout_url: checkoutUrl,
        message: checkoutUrl
          ? 'Account created. Complete payment to activate your plan.'
          : 'Account created. Contact support to activate your plan.'
      });
    } catch (err) {
      console.error('[merchant] register error:', err);
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  // ── POST /merchant/auth/login ────────────────────────────────────────────
  router.post('/merchant/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const pool = getPool();
      const result = await pool.query<Merchant>(`SELECT * FROM merchants WHERE email = $1`, [email.toLowerCase()]);
      await pool.end();

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const merchant = result.rows[0];
      if (!merchant.password_hash) {
        return res.status(401).json({ error: 'Password login not available for this account' });
      }

      const valid = await bcrypt.compare(password, merchant.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = signJwt(merchant.id);
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const pool2 = getPool();
      await pool2.query(
        `INSERT INTO merchant_sessions (id, merchant_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
        [randomUUID(), merchant.id, tokenHash, expiresAt]
      );
      await pool2.end();

      return res.json({
        token,
        merchant: {
          id: merchant.id,
          email: merchant.email,
          first_name: merchant.first_name,
          last_name: merchant.last_name,
          store_name: merchant.store_name,
          plan: merchant.plan,
          plan_status: merchant.plan_status
        }
      });
    } catch (err) {
      console.error('[merchant] login error:', err);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  // ── POST /merchant/auth/logout ───────────────────────────────────────────
  router.post('/merchant/auth/logout', merchantAuthMiddleware as express.RequestHandler, async (req: AuthenticatedRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        const tokenHash = hashToken(token);
        const pool = getPool();
        await pool.query(`DELETE FROM merchant_sessions WHERE token_hash = $1`, [tokenHash]);
        await pool.end();
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[merchant] logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
  });

  // ── GET /merchant/auth/me ────────────────────────────────────────────────
  router.get('/merchant/auth/me', merchantAuthMiddleware as express.RequestHandler, (req: AuthenticatedRequest, res) => {
    const m = req.merchant!;
    return res.json({
      id: m.id,
      email: m.email,
      first_name: m.first_name,
      last_name: m.last_name,
      store_name: m.store_name,
      store_address: m.store_address,
      store_phone: m.store_phone,
      city: m.city,
      state: m.state,
      zip: m.zip,
      plan: m.plan,
      plan_status: m.plan_status,
      onboarding_path: m.onboarding_path,
      created_at: m.created_at
    });
  });

  // ── POST /merchant/subscribe ─────────────────────────────────────────────
  router.post(
    '/merchant/subscribe',
    merchantAuthMiddleware as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { plan } = req.body as { plan?: string };
        const selectedPlan = (plan === 'growth' ? 'growth' : 'access') as keyof typeof PLANS;
        const merchant = req.merchant!;

        const stripe = getStripe();
        if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

        const priceId = selectedPlan === 'growth'
          ? process.env.MERCHANT_STRIPE_PRICE_GROWTH
          : process.env.MERCHANT_STRIPE_PRICE_ACCESS;

        if (!priceId) return res.status(503).json({ error: 'Stripe price IDs not configured' });

        let customerId = merchant.stripe_customer_id;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: merchant.email,
            name: merchant.store_name,
            metadata: { merchant_id: merchant.id }
          });
          customerId = customer.id;
          const pool = getPool();
          await pool.query(`UPDATE merchants SET stripe_customer_id = $1 WHERE id = $2`, [customerId, merchant.id]);
          await pool.end();
        }

        const frontendUrl = process.env.FRONTEND_URL ?? 'https://stylere-shopify-delivery.vercel.app';
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'subscription',
          payment_method_types: ['card'],
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${frontendUrl}/shopify/merchant/dashboard?checkout=success`,
          cancel_url: `${frontendUrl}/shopify/merchant/pricing?checkout=cancelled`,
          metadata: { merchant_id: merchant.id, plan: selectedPlan },
          subscription_data: { metadata: { merchant_id: merchant.id, plan: selectedPlan } }
        });

        return res.json({ checkout_url: session.url });
      } catch (err) {
        console.error('[merchant] subscribe error:', err);
        return res.status(500).json({ error: 'Subscription creation failed' });
      }
    }
  );

  // ── GET /merchant/billing ────────────────────────────────────────────────
  router.get(
    '/merchant/billing',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const pool = getPool();
        const result = await pool.query(
          `SELECT * FROM merchant_billing WHERE merchant_id = $1 ORDER BY created_at DESC`,
          [req.merchant!.id]
        );
        await pool.end();
        return res.json({ invoices: result.rows, plan: req.merchant!.plan, plan_status: req.merchant!.plan_status });
      } catch (err) {
        console.error('[merchant] billing error:', err);
        return res.status(500).json({ error: 'Failed to fetch billing history' });
      }
    }
  );

  // ── POST /merchant/billing/portal ────────────────────────────────────────
  router.post(
    '/merchant/billing/portal',
    merchantAuthMiddleware as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const stripe = getStripe();
        if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

        const merchant = req.merchant!;
        if (!merchant.stripe_customer_id) {
          return res.status(400).json({ error: 'No Stripe customer associated with this account' });
        }

        const frontendUrl = process.env.FRONTEND_URL ?? 'https://stylere-shopify-delivery.vercel.app';
        const session = await stripe.billingPortal.sessions.create({
          customer: merchant.stripe_customer_id,
          return_url: `${frontendUrl}/shopify/merchant/dashboard`
        });

        return res.json({ portal_url: session.url });
      } catch (err) {
        console.error('[merchant] billing portal error:', err);
        return res.status(500).json({ error: 'Failed to create billing portal session' });
      }
    }
  );

  // ── Stripe webhook for merchant billing ─────────────────────────────────
  router.post('/merchant/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.MERCHANT_STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret ?? '');
    } catch (err) {
      console.error('[merchant] stripe webhook signature error:', err);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    try {
      const pool = getPool();

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const merchantId = session.metadata?.merchant_id;
        const plan = session.metadata?.plan;
        const subscriptionId = session.subscription as string | null;

        if (merchantId) {
          await pool.query(
            `UPDATE merchants SET plan_status = 'active', plan = $1, stripe_subscription_id = $2, updated_at = NOW() WHERE id = $3`,
            [plan ?? 'access', subscriptionId, merchantId]
          );
        }
      }

      if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const merchantResult = await pool.query<Merchant>(
          `SELECT id FROM merchants WHERE stripe_customer_id = $1`,
          [customerId]
        );
        if (merchantResult.rows.length > 0) {
          const merchantId = merchantResult.rows[0].id;
          await pool.query(
            `INSERT INTO merchant_billing (id, merchant_id, stripe_invoice_id, amount_cents, status, period_start, period_end)
             VALUES ($1, $2, $3, $4, 'paid', $5, $6)`,
            [
              randomUUID(),
              merchantId,
              invoice.id,
              invoice.amount_paid,
              invoice.period_start ? new Date(invoice.period_start * 1000) : null,
              invoice.period_end ? new Date(invoice.period_end * 1000) : null
            ]
          );
          await pool.query(`UPDATE merchants SET plan_status = 'active', updated_at = NOW() WHERE id = $1`, [merchantId]);
        }
      }

      if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const merchantResult = await pool.query<Merchant>(
          `SELECT id FROM merchants WHERE stripe_customer_id = $1`,
          [customerId]
        );
        if (merchantResult.rows.length > 0) {
          const merchantId = merchantResult.rows[0].id;
          await pool.query(
            `UPDATE merchants SET plan_status = 'past_due', updated_at = NOW() WHERE id = $1`,
            [merchantId]
          );
          await pool.query(
            `INSERT INTO merchant_billing (id, merchant_id, stripe_invoice_id, amount_cents, status)
             VALUES ($1, $2, $3, $4, 'failed')`,
            [randomUUID(), merchantId, invoice.id, invoice.amount_due]
          );
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        await pool.query(
          `UPDATE merchants SET plan_status = 'cancelled', updated_at = NOW() WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
      }

      await pool.end();
      return res.json({ received: true });
    } catch (err) {
      console.error('[merchant] stripe webhook processing error:', err);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ── GET /merchant/dashboard ──────────────────────────────────────────────
  router.get(
    '/merchant/dashboard',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const merchant = req.merchant!;
        const pool = getPool();

        // Stats from storree_orders if the merchant has a shop domain, else delivery_jobs
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let stats = { active: 0, pending: 0, completed_today: 0, failed: 0, total: 0 };

        // Try storree_orders first
        const ordersResult = await pool.query(
          `SELECT status, COUNT(*) as count FROM storree_orders
           WHERE created_at >= NOW() - INTERVAL '30 days'
           GROUP BY status`
        );

        for (const row of ordersResult.rows as Array<{ status: string; count: string }>) {
          const c = parseInt(row.count);
          if (['assigned', 'picked_up', 'en_route'].includes(row.status)) stats.active += c;
          else if (row.status === 'pending') stats.pending += c;
          else if (row.status === 'delivered') stats.completed_today += c;
          else if (['failed', 'cancelled'].includes(row.status)) stats.failed += c;
          stats.total += c;
        }

        const recentOrders = await pool.query(
          `SELECT id, customer_name, customer_phone, status, total_amount_cents, created_at
           FROM storree_orders
           ORDER BY created_at DESC
           LIMIT 5`
        );

        await pool.end();

        return res.json({
          merchant: {
            id: merchant.id,
            store_name: merchant.store_name,
            plan: merchant.plan,
            plan_status: merchant.plan_status
          },
          stats,
          recent_orders: recentOrders.rows
        });
      } catch (err) {
        console.error('[merchant] dashboard error:', err);
        return res.status(500).json({ error: 'Failed to fetch dashboard data' });
      }
    }
  );

  // ── GET /merchant/orders ─────────────────────────────────────────────────
  router.get(
    '/merchant/orders',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const page = Math.max(1, parseInt(req.query.page as string ?? '1'));
        const limit = Math.min(50, parseInt(req.query.limit as string ?? '20'));
        const offset = (page - 1) * limit;
        const status = req.query.status as string | undefined;

        const pool = getPool();

        let query = `SELECT id, customer_name, customer_phone, customer_email, delivery_address,
          status, total_amount_cents, created_at, updated_at
          FROM storree_orders`;
        const params: (string | number)[] = [];
        if (status) {
          query += ` WHERE status = $1`;
          params.push(status);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        const countQuery = status
          ? `SELECT COUNT(*) FROM storree_orders WHERE status = $1`
          : `SELECT COUNT(*) FROM storree_orders`;
        const countResult = await pool.query(countQuery, status ? [status] : []);

        await pool.end();

        return res.json({
          orders: result.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
          }
        });
      } catch (err) {
        console.error('[merchant] orders error:', err);
        return res.status(500).json({ error: 'Failed to fetch orders' });
      }
    }
  );

  // ── GET /merchant/orders/:id ─────────────────────────────────────────────
  router.get(
    '/merchant/orders/:id',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const pool = getPool();
        const result = await pool.query(`SELECT * FROM storree_orders WHERE id = $1`, [req.params.id]);

        if (result.rows.length === 0) {
          await pool.end();
          return res.status(404).json({ error: 'Order not found' });
        }

        const order = result.rows[0];

        // Fetch related delivery job and dispatch attempts for tracking
        const jobResult = await pool.query(
          `SELECT dj.*, da.attempted_at, da.status as attempt_status, da.provider_response
           FROM delivery_jobs dj
           LEFT JOIN dispatch_attempts da ON da.job_id = dj.id
           WHERE dj.shopify_order_id = $1
           ORDER BY da.attempted_at DESC`,
          [order.id]
        );

        await pool.end();

        return res.json({ order, tracking: jobResult.rows });
      } catch (err) {
        console.error('[merchant] order detail error:', err);
        return res.status(500).json({ error: 'Failed to fetch order details' });
      }
    }
  );

  // ── POST /merchant/orders ────────────────────────────────────────────────
  router.post(
    '/merchant/orders',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const {
          customer_name,
          customer_phone,
          customer_email,
          delivery_address,
          items,
          total_amount_cents
        } = req.body as {
          customer_name?: string;
          customer_phone?: string;
          customer_email?: string;
          delivery_address?: string;
          items?: unknown;
          total_amount_cents?: number;
        };

        if (!customer_name || !delivery_address) {
          return res.status(400).json({ error: 'customer_name and delivery_address are required' });
        }

        const pool = getPool();
        const result = await pool.query(
          `INSERT INTO storree_orders
           (id, customer_name, customer_phone, customer_email, delivery_address, items, total_amount_cents, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
           RETURNING *`,
          [
            randomUUID(),
            customer_name,
            customer_phone ?? null,
            customer_email ?? null,
            delivery_address,
            items ? JSON.stringify(items) : null,
            total_amount_cents ?? 0
          ]
        );
        await pool.end();

        return res.status(201).json({ order: result.rows[0] });
      } catch (err) {
        console.error('[merchant] create order error:', err);
        return res.status(500).json({ error: 'Failed to create order' });
      }
    }
  );

  // ── GET /merchant/settings ───────────────────────────────────────────────
  router.get(
    '/merchant/settings',
    merchantAuthMiddleware as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      const m = req.merchant!;
      return res.json({
        store_name: m.store_name,
        store_address: m.store_address,
        store_phone: m.store_phone,
        city: m.city,
        state: m.state,
        zip: m.zip,
        email: m.email,
        first_name: m.first_name,
        last_name: m.last_name
      });
    }
  );

  // ── PUT /merchant/settings ───────────────────────────────────────────────
  router.put(
    '/merchant/settings',
    merchantAuthMiddleware as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { store_name, store_address, store_phone, city, state, zip, first_name, last_name } = req.body as {
          store_name?: string;
          store_address?: string;
          store_phone?: string;
          city?: string;
          state?: string;
          zip?: string;
          first_name?: string;
          last_name?: string;
        };

        const pool = getPool();
        await pool.query(
          `UPDATE merchants SET
           store_name = COALESCE($1, store_name),
           store_address = COALESCE($2, store_address),
           store_phone = COALESCE($3, store_phone),
           city = COALESCE($4, city),
           state = COALESCE($5, state),
           zip = COALESCE($6, zip),
           first_name = COALESCE($7, first_name),
           last_name = COALESCE($8, last_name),
           updated_at = NOW()
           WHERE id = $9`,
          [store_name, store_address, store_phone, city, state, zip, first_name, last_name, req.merchant!.id]
        );

        const result = await pool.query<Merchant>(`SELECT * FROM merchants WHERE id = $1`, [req.merchant!.id]);
        await pool.end();

        const m = result.rows[0];
        return res.json({
          store_name: m.store_name,
          store_address: m.store_address,
          store_phone: m.store_phone,
          city: m.city,
          state: m.state,
          zip: m.zip,
          email: m.email,
          first_name: m.first_name,
          last_name: m.last_name
        });
      } catch (err) {
        console.error('[merchant] settings update error:', err);
        return res.status(500).json({ error: 'Failed to update settings' });
      }
    }
  );

  // ── GET /merchant/team ───────────────────────────────────────────────────
  router.get(
    '/merchant/team',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      if (req.merchant!.plan !== 'growth') {
        return res.status(403).json({ error: 'Team management requires Stowry Growth plan', upgrade_required: true });
      }

      const pool = getPool();
      const result = await pool.query(
        `SELECT id, email, role, first_name, last_name, is_active, created_at
         FROM merchant_staff WHERE merchant_id = $1 ORDER BY created_at ASC`,
        [req.merchant!.id]
      );
      await pool.end();

      return res.json({ staff: result.rows });
    }
  );

  // ── POST /merchant/team ──────────────────────────────────────────────────
  router.post(
    '/merchant/team',
    merchantAuthMiddleware as express.RequestHandler,
    requireActivePlan as express.RequestHandler,
    async (req: AuthenticatedRequest, res) => {
      if (req.merchant!.plan !== 'growth') {
        return res.status(403).json({ error: 'Team management requires Stowry Growth plan', upgrade_required: true });
      }

      try {
        const { email, role, first_name, last_name } = req.body as {
          email?: string;
          role?: string;
          first_name?: string;
          last_name?: string;
        };

        if (!email) return res.status(400).json({ error: 'email is required' });

        const pool = getPool();
        const result = await pool.query(
          `INSERT INTO merchant_staff (id, merchant_id, email, role, first_name, last_name)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [randomUUID(), req.merchant!.id, email, role ?? 'staff', first_name ?? null, last_name ?? null]
        );
        await pool.end();

        return res.status(201).json({ staff_member: result.rows[0] });
      } catch (err) {
        console.error('[merchant] team invite error:', err);
        return res.status(500).json({ error: 'Failed to invite staff member' });
      }
    }
  );

  return router;
}
