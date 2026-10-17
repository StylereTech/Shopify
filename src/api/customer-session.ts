import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { CheckoutError, type GuestSession } from '../domain/customer-checkout.js';
import type { CustomerCheckoutRepository } from '../infrastructure/persistence/customer-checkout.js';

export const GUEST_COOKIE = '__Host-stylere_checkout';
export const GUEST_HEADER = 'X-Stylere-Guest-Id';
const maxAge = 7 * 24 * 60 * 60 * 1000;
export function checkoutFailure(res: Response, error: unknown) {
  if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message, code: error.code });
  return res.status(503).json({ error: 'Checkout is temporarily unavailable. Retry this same request.', code: 'CHECKOUT_UNAVAILABLE' });
}
export const handled = (run: (req:Request,res:Response)=>Promise<unknown>):RequestHandler => (req,res) => { void run(req,res).catch(error => checkoutFailure(res,error)); };
export function guestOf(res:Response):GuestSession { return res.locals.customerGuest as GuestSession; }
export function requireCustomerOrigin(req:Request, configured?:string[]) {
  const allowed = configured ?? (process.env.CUSTOMER_ALLOWED_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean);
  if (!allowed.length) throw new CheckoutError(503,'CHECKOUT_NOT_CONFIGURED','Customer checkout origin is not configured.');
  const origin = req.header('Origin');
  if (!origin || !allowed.includes(origin) || req.header('Sec-Fetch-Site') === 'cross-site') throw new CheckoutError(403,'CHECKOUT_ORIGIN_DENIED','Open checkout on the configured Style.re website.');
  if (!req.is('application/json')) throw new CheckoutError(415,'JSON_REQUIRED','A JSON request is required.');
}
async function fromCookie(req:Request,repository:CustomerCheckoutRepository) {
  const parts = (req.header('Cookie') ?? '').split(';').map(s=>s.trim()).filter(s=>s.startsWith(`${GUEST_COOKIE}=`));
  if (parts.length !== 1) return undefined;
  const token = parts[0].slice(GUEST_COOKIE.length+1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return repository.findSession(createHash('sha256').update(token).digest('hex'));
}
export function customerGuard(repository:()=>CustomerCheckoutRepository,allowedOrigins?:string[]):RequestHandler {
  return (req,res,next)=>{
    res.setHeader('Cache-Control','private, no-store');
    void (async()=>{
      if (!['GET','HEAD'].includes(req.method)) requireCustomerOrigin(req,allowedOrigins);
      const guest = await fromCookie(req,repository());
      if (!guest) throw new CheckoutError(401,'GUEST_SESSION_EXPIRED','Your checkout session has expired. Start a new checkout session.');
      if (req.header(GUEST_HEADER) !== guest.id) throw new CheckoutError(409,'GUEST_SESSION_CHANGED','Your checkout session changed. Refresh to continue.');
      res.locals.customerGuest=guest;
      next();
    })().catch(error=>checkoutFailure(res,error));
  };
}
export function createCustomerSessionRouter(repository:()=>CustomerCheckoutRepository,allowedOrigins?:string[]) {
  const router=Router();
  router.use('/customer/session',(_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');next();});
  router.get('/customer/session',handled(async(req,res)=>{
    const guest=await fromCookie(req,repository());
    if (!guest) throw new CheckoutError(401,'GUEST_SESSION_EXPIRED','No active checkout session.');
    const expected=req.header(GUEST_HEADER);
    if (expected && expected!==guest.id) throw new CheckoutError(409,'GUEST_SESSION_CHANGED','Your checkout session changed. Refresh to continue.');
    return res.json({guestId:guest.id,expiresAt:guest.expiresAt.toISOString()});
  }));
  router.post('/customer/session',handled(async(req,res)=>{
    requireCustomerOrigin(req,allowedOrigins);
    if (!req.body || Object.keys(req.body).length) throw new CheckoutError(400,'INVALID_REQUEST','Session initialization requires an empty object.');
    const repo=repository();
    const prior=await fromCookie(req,repo);
    const expected=req.header(GUEST_HEADER);
    if (expected && expected!==prior?.id) throw new CheckoutError(409,'GUEST_SESSION_CHANGED','Your checkout session changed. Refresh before starting again.');
    if (prior) return res.json({guestId:prior.id,expiresAt:prior.expiresAt.toISOString()});
    const token=randomBytes(32).toString('base64url');
    const guest={id:randomUUID(),tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+maxAge)};
    await repo.createSession(guest);
    res.cookie(GUEST_COOKIE,token,{secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge});
    return res.status(201).json({guestId:guest.id,expiresAt:guest.expiresAt.toISOString()});
  }));
  router.delete('/customer/session',customerGuard(repository,allowedOrigins),handled(async(_req,res)=>{
    await repository().revokeSession(guestOf(res).id);
    // Do not clear a shared browser cookie: a late logout response must not erase
    // a new session created in another tab. The revoked credential is unusable.
    return res.status(204).end();
  }));
  return router;
}
