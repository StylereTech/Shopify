import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMerchantSession, createMerchantTransport, MerchantRequestError } from '../src/api/merchantSession';
import { createMerchantAuthController, parseMerchant } from '../src/context/merchantAuthController';

const owner = '11111111-1111-4111-8111-111111111111';
const profile = { id: owner, email: 'owner@example.test', store_name: 'Example store', plan: 'access', plan_status: 'active', first_name: null, last_name: null };
function storage(initial: string | null = null) {
  const values = new Map<string,string>(initial ? [['merchant_token', initial]] : []);
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string,value: string) => { values.set(key,value); }, removeItem: (key: string) => { values.delete(key); } };
}
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes,no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('merchant request lifetime and credentials', () => {
  it('omits ambient credentials on public requests and overrides supplied authorization with captured identity', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const request = createMerchantTransport({ fetcher });
    await request('/api/merchant/plans', { headers: { Authorization: 'Bearer wrong' }, credentials: 'include' });
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('authorization')).toBe(false);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
    await request('/api/merchant/settings', { headers: { Authorization: 'Bearer wrong' } }, { token: 'captured' });
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('authorization')).toBe('Bearer captured');
  });
  it('preserves HTTP401 when an upstream error is HTML', async () => {
    const request = createMerchantTransport({ fetcher: vi.fn(async () => new Response('<html>denied</html>', {status:401})) });
    await expect(request('/api/merchant/auth/me')).rejects.toMatchObject({status:401});
  });
  it('times out a fetch that ignores AbortSignal, without retrying writes', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const request = createMerchantTransport({ fetcher, timeoutMs: 100 });
    const result = expect(request('/api/merchant/orders', {method:'POST',body:'{}'})).rejects.toMatchObject({code:'TIMEOUT'});
    await vi.advanceTimersByTimeAsync(101); await result;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('keeps the deadline active through a hung JSON body', async () => {
    vi.useFakeTimers();
    const response = Response.json({});
    vi.spyOn(response,'json').mockImplementation(() => new Promise(() => {}));
    const request = createMerchantTransport({ fetcher: vi.fn(async () => response), timeoutMs:100 });
    const result = expect(request('/api/merchant/orders')).rejects.toMatchObject({code:'TIMEOUT'});
    await vi.advanceTimersByTimeAsync(101); await result;
  });
  it('rejects data that arrives after the account changed during body parsing', async () => {
    const body = deferred<unknown>(); let valid = true;
    const response = Response.json({}); vi.spyOn(response,'json').mockImplementation(() => body.promise);
    const request = createMerchantTransport({fetcher:vi.fn(async () => response)});
    const result = expect(request('/api/merchant/orders', {}, {current:() => valid})).rejects.toMatchObject({code:'STALE_SESSION'});
    await flush(); valid = false; body.resolve({orders:[]}); await result;
  });
  it('does not fetch an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(async () => Response.json({}));
    await expect(createMerchantTransport({fetcher})('/api/merchant/plans', {signal:controller.signal})).rejects.toMatchObject({code:'ABORTED'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['https://other.test/api/merchant','/api/customer','/api/merchant/../auth','/api/merchant/%2e%2e/auth','/api/merchant/a%2fb','/api/merchant/x#secret'])('rejects a destination outside merchant scope: %s', async path => {
    const fetcher = vi.fn(async () => Response.json({}));
    await expect(createMerchantTransport({fetcher})(path, {}, {token:'captured'})).rejects.toMatchObject({code:'INVALID_PATH'});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns a rejected promise for an obsolete session before fetching', async () => {
    const transport = vi.fn();
    const session = createMerchantSession({key:'generation',owner,token:'captured',current:()=>false,transport});
    await expect(session.request('/api/merchant/orders')).rejects.toMatchObject({code:'STALE_SESSION'});
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('merchant auth state', () => {
  it('keeps credentials on503 while hiding unverified account data, then permits retry', async () => {
    const store = storage('original');
    const transport = vi.fn().mockRejectedValueOnce(new MerchantRequestError('Unavailable',503)).mockResolvedValue(profile);
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount(); await flush();
    expect(controller.getSnapshot()).toMatchObject({merchant:null,loading:false,error:'Unavailable',token:'original'});
    expect(store.getItem('merchant_token')).toBe('original');
    await controller.retry(); expect(controller.getSnapshot().merchant?.id).toBe(owner); stop();
  });
  it('removes only the still-current credential after an authoritative401', async () => {
    const store = storage('original');
    const controller = createMerchantAuthController({storage:store,transport:vi.fn().mockRejectedValue(new MerchantRequestError('Denied',401))});
    const stop = controller.mount(); await flush();
    expect(store.getItem('merchant_token')).toBe(null); expect(controller.getSnapshot()).toMatchObject({token:null,loading:false,error:null}); stop();
  });
  it('does not let an older failed profile request clear a newer login', async () => {
    const old = deferred<unknown>(); const store = storage('original');
    const transport = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue(profile);
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount();
    store.setItem('merchant_token','replacement'); await controller.retry();
    old.reject(new MerchantRequestError('Denied',401)); await flush();
    expect(store.getItem('merchant_token')).toBe('replacement'); expect(controller.getSnapshot().merchant?.id).toBe(owner); stop();
  });
  it('blocks duplicate login attempts and rejects a late result after navigation cancellation', async () => {
    const response = deferred<unknown>(); const store = storage(); const transport = vi.fn(() => response.promise);
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount();
    const abort = new AbortController(); const pending = expect(controller.login(profile.email,'password',abort.signal)).rejects.toMatchObject({code:'ABORTED'});
    await expect(controller.login(profile.email,'password')).rejects.toMatchObject({code:'BUSY'});
    abort.abort(); response.resolve({token:'new-token',merchant:profile}); await pending;
    expect(store.getItem('merchant_token')).toBe(null); expect(transport).toHaveBeenCalledTimes(1); stop();
  });
  it('rejects another account in the login receipt', async () => {
    const store = storage(); const controller = createMerchantAuthController({storage:store,transport:vi.fn().mockResolvedValue({token:'new-token',merchant:profile})}); const stop = controller.mount();
    await expect(controller.login('different@example.test','password')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(store.getItem('merchant_token')).toBe(null); stop();
  });
  it('rejects late login after provider disposal, including StrictMode remount', async () => {
    const response = deferred<unknown>(); const store = storage(); const controller = createMerchantAuthController({storage:store,transport:vi.fn(() => response.promise)});
    const stop = controller.mount(); const pending = expect(controller.login(profile.email,'password')).rejects.toMatchObject({code:'STALE_SESSION'});
    stop(); const stopAgain = controller.mount(); response.resolve({token:'late-token',merchant:profile}); await pending;
    expect(store.getItem('merchant_token')).toBe(null); stopAgain();
  });
  it('retains the current session when logout fails and clears it only after a verified receipt', async () => {
    const store = storage('original'); const transport = vi.fn().mockResolvedValueOnce(profile).mockRejectedValueOnce(new MerchantRequestError('Unavailable',503)).mockResolvedValueOnce({ok:true});
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount(); await flush();
    const before = controller.getSnapshot();
    await expect(controller.logout()).rejects.toMatchObject({status:503});
    expect(controller.getSnapshot()).toBe(before); expect(store.getItem('merchant_token')).toBe('original');
    await controller.logout(); expect(store.getItem('merchant_token')).toBe(null); expect(before.sessionSignal.aborted).toBe(true); stop();
  });
  it('aborts generation-bound requests when storage changes to another account', async () => {
    const store = storage('original'); const events = new EventTarget();
    const controller = createMerchantAuthController({storage:store,transport:vi.fn().mockResolvedValue(profile),events: events as unknown as Window}); const stop = controller.mount(); await flush();
    const before = controller.getSnapshot(); store.setItem('merchant_token','replacement');
    const event = Object.assign(new Event('storage'),{key:'merchant_token'}); events.dispatchEvent(event); await flush();
    expect(before.sessionSignal.aborted).toBe(true); expect(controller.isCurrent(before.sessionKey,owner,'original')).toBe(false);
    expect(controller.getSnapshot().sessionKey).not.toContain('replacement'); stop();
  });
  it('cannot clear a replacement account when an older logout response arrives', async () => {
    const oldLogout = deferred<unknown>(); const store = storage('original');
    const transport = vi.fn().mockResolvedValueOnce(profile).mockImplementationOnce(() => oldLogout.promise).mockResolvedValueOnce(profile);
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount(); await flush();
    const pending = expect(controller.logout()).rejects.toMatchObject({code:'STALE_SESSION'});
    store.setItem('merchant_token','replacement'); await controller.retry();
    oldLogout.resolve({ok:true}); await pending;
    expect(store.getItem('merchant_token')).toBe('replacement'); expect(controller.getSnapshot().merchant?.id).toBe(owner); stop();
  });
  it('keeps the account when a successful HTTP logout has no verified receipt', async () => {
    const store = storage('original'); const transport = vi.fn().mockResolvedValueOnce(profile).mockResolvedValueOnce({});
    const controller = createMerchantAuthController({storage:store,transport}); const stop = controller.mount(); await flush();
    await expect(controller.logout()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
    expect(store.getItem('merchant_token')).toBe('original'); expect(controller.getSnapshot().merchant?.id).toBe(owner); stop();
  });
  it('reports inaccessible storage instead of throwing during provider construction', async () => {
    const controller = createMerchantAuthController({storage:{getItem:()=>{throw Error('disabled');},setItem:()=>{},removeItem:()=>{}},transport:vi.fn()}); const stop = controller.mount();
    expect(controller.getSnapshot().error).toContain('storage'); expect(controller.getSnapshot().loading).toBe(false); stop();
  });
  it('accepts nullable profile fields without accepting a partial identity', () => {
    expect(parseMerchant(profile).first_name).toBe(null);
    expect(() => parseMerchant({...profile,id:''})).toThrow();
    expect(() => parseMerchant({...profile,email:null})).toThrow();
    expect(() => parseMerchant({...profile,store_phone:{raw:'x'}})).toThrow();
  });
});
