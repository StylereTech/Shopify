import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const root = fileURLToPath(new URL('../src/', import.meta.url));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class CustomerRequestError extends Error { constructor(message, status = 0, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; } }
const address = { street: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201', country: 'US' };
const payload = { serviceType: 'item_delivery', pickupAddress: address, dropoffAddress: { ...address, street: '2 Main St' }, contact: { name: 'Test Customer', phone: '+12145550100', email: 'customer@example.test' }, items: [] };
const order = { ...payload, id: 'SR-order-a', guestId: 'guest-a', requestId: 'request-a', amountCents: 1234, currency: 'usd', status: 'pending', pricing: { subtotal: 0, deliveryFee: 9, serviceFee: 2, tax: 1.34, total: 12.34, estimatedMinutes: 50 }, paymentStatus: 'unpaid', createdAt: '2026-10-17T12:00:00.000Z', updatedAt: '2026-10-17T12:00:00.000Z' };
const intent = { guestId: order.guestId, orderId: order.id, paymentIntentId: 'pi_testOrder', clientSecret: 'pi_testOrder_secret_fixture', amountCents: 1234, currency: 'usd', status: 'requires_payment_method' };
const receipt = { success: true, guestId: order.guestId, orderId: order.id, paymentIntentId: intent.paymentIntentId, paymentStatus: 'paid', dispatched: false };
function storeFixture(extra = {}) {
  const state = { guestId: order.guestId, revision: 7, draft: { ...payload }, checkoutRequest: null, currentOrder: null, storageIssue: null, ...extra };
  const calls = [];
  Object.assign(state, {
    prepareCheckout() { calls.push(['prepare']); return state.checkoutRequest ??= { requestId: 'request-a', payload, revision: state.revision, phase: 'prepared' }; },
    markCheckoutUncertain(id) { calls.push(['uncertain', id]); state.checkoutRequest.phase = 'unknown'; },
    rejectCheckout(id, revision) { calls.push(['reject', id, revision]); state.checkoutRequest = null; },
    acceptCheckout(value, id, revision) { calls.push(['accept', id, revision]); state.currentOrder = value; state.draft.orderId = value.id; state.checkoutRequest = null; return true; },
    setPaymentIntentId(id, orderId, revision) { calls.push(['intent', id, orderId, revision]); return true; },
    clearDraft() { calls.push(['clear']); state.draft = {}; return true; },
    setServiceType(type) { state.draft.serviceType = type; },
  });
  const store = () => state; store.getState = () => state;
  return { store, state, calls };
}
function fixture(file, component, options = {}) {
  const cells = [], effects = [], cleanups = [], cache = new Map(), queryOptions = [], calls = [], navigation = [];
  let cursor = 0, dirty = false, tree, current = true, id = 0;
  const stored = options.store ?? storeFixture();
  const session = { key: 'guest-a:g1', guestId: order.guestId, status: 'ready', current: () => current, assertCurrent() { if (!current) throw new CustomerRequestError('Changed', 409, 'STALE_SESSION'); }, retry() { calls.push(['restore']); }, ...options.session };
  const api = { createOrder: async () => order, recoverOrder: async () => order, getOrder: async () => order, createPaymentIntent: async () => intent, confirmPayment: async () => receipt, listOrders: async () => ({ guestId: order.guestId, orders: [order], pagination: { page: 1, limit: 20, total: 1, pages: 1 } }), getChat: async () => ({ guestId: order.guestId, orderId: order.id, available: false, messages: [] }), getTracking: async () => ({}), ...options.api };
  const trackedApi = new Proxy(api, { get: (target, key) => (...args) => { calls.push([key, ...args]); return target[key](...args); } });
  let query = { data: order, isPending: false, isError: false, isFetching: false, isFetchedAfterMount: true, dataUpdatedAt: Date.parse(order.updatedAt), refetch: async () => { calls.push(['refetch']); }, ...options.query };
  const react = {
    useState(value) { const i = cursor++; if (!(i in cells)) cells[i] = typeof value === 'function' ? value() : value; return [cells[i], next => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; dirty = true; }]; },
    useRef(value) { const i = cursor++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
    useEffect(effect, dependencies) { const i = cursor++, previous = cells[i]; if (!previous || !dependencies || dependencies.some((value, index) => value !== previous[index])) { cells[i] = dependencies; effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); }); } },
    useId() { const i = cursor++; if (!(i in cells)) cells[i] = ':id' + ++id + ':'; return cells[i]; },
  };
  const load = filename => {
    const absolute = path.resolve(root, filename);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    let source = fs.readFileSync(absolute, 'utf8').replaceAll('import.meta.env.VITE_STRIPE_PK', "'pk_test_fixture'");
    if (filename === file && component) source += '\nexport { ' + component + ' };';
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} }; cache.set(absolute, module);
    vm.runInNewContext(code, { module, exports: module.exports, Error, URLSearchParams, AbortController, setTimeout: options.sdkTimeoutMs ? (callback, delay) => setTimeout(callback, Math.min(delay, options.sdkTimeoutMs)) : setTimeout, clearTimeout, Intl, window: { location: { origin: 'https://app.example.test' } }, require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-router-dom') return { Link: 'Link', useLocation: () => options.location ?? { pathname: '/order', search: '' }, useNavigate: () => (...args) => navigation.push(args), useParams: () => ({ orderId: order.id }) };
      if (name === '@tanstack/react-query') return { useQuery: value => { queryOptions.push(value); return options.queries?.[value.queryKey[0]] ?? query; } };
      if (name === '@stripe/stripe-js') return { loadStripe: () => Promise.resolve({}) };
      if (name === '@stripe/react-stripe-js') return { Elements: 'Elements', ExpressCheckoutElement: 'ExpressCheckoutElement', PaymentElement: 'PaymentElement', useStripe: () => options.stripe ?? { confirmPayment: async () => ({ paymentIntent: { id: intent.paymentIntentId, amount: intent.amountCents, currency: 'usd', status: 'succeeded' } }) }, useElements: () => options.elements ?? { submit: async () => ({}) } };
      if (name.includes('/api/client')) return { customerApi: () => trackedApi };
      if (name.includes('/api/customerSession')) return { CustomerRequestError };
      if (name.includes('/context/useCustomerSession')) return { useCustomerSession: () => session };
      if (name.includes('/store/orderStore')) return { useOrderStore: stored.store };
      if (name.includes('components/customer/CustomerUI')) return Object.fromEntries(['ReadError','SessionNotice','SavedTime','OrderDetails','OrderPrice','MissingOrder'].map(value => [value, value]));
      if (name.includes('components/layout/AppShell')) return { AppShell: 'AppShell' };
      if (name.endsWith('.css') || name.endsWith('.jpg')) return {};
      const resolved = path.resolve(path.dirname(absolute), name);
      for (const suffix of ['', '.ts', '.tsx', '/index.ts']) if (fs.existsSync(resolved + suffix)) return load(path.relative(root, resolved + suffix));
      throw new Error(name);
    } });
    return module.exports;
  };
  const module = load(file);
  let props = { session, order, orderId: order.id, intent, revision: stored.state.revision, page: 1, current: session.current, recheck: async () => calls.push(['recheck']), ...options.props };
  const render = () => { let safety = 0; do { assert.ok(safety++ < 10); dirty = false; cursor = 0; if (options.action) props = { ...props, action: load('hooks/useCustomerAction.ts').useCustomerAction(session) }; tree = module[component](props); while (effects.length) effects.shift()(); } while (dirty); return tree; };
  const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  const text = value => Array.isArray(value) ? value.map(text).join(' ') : value == null || typeof value === 'boolean' ? '' : typeof value === 'object' ? text(value.props?.children) : String(value);
  const find = predicate => { const found = nodes(tree).find(predicate); assert.ok(found, 'Expected matching element in ' + component); return found; };
  if (component) render();
  return { module, load, render, session, stored, calls, navigation, queryOptions, text: () => text(tree), all: () => nodes(tree), find,
    button: label => find(node => node.type === 'button' && text(node).trim() === label),
    setQuery: patch => { query = { ...query, ...patch }; render(); }, setCurrent: value => { current = value; render(); },
    flush: async () => { await new Promise(setImmediate); if (component) render(); }, unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  };
}

test('customer routes retain safe order/history context and reject ambiguous IDs', () => {
  const helpers = fixture('lib/customerPageState.ts').module;
  assert.equal(helpers.readOrderLocation('?orderId=SR-order-a', 'SR-order-b'), 'SR-order-a');
  for (const search of ['?orderId=', '?orderId=SR-order-a&orderId=SR-order-b', '?orderId=%2Fmerchant']) assert.equal(helpers.readOrderLocation(search, 'SR-order-b'), undefined);
  assert.equal(helpers.safeHistoryReturn('?returnTo=' + encodeURIComponent('/orders?page=3&status=in_transit')), '/orders?page=3&status=in_transit');
  assert.equal(helpers.safeHistoryReturn('?returnTo=https://evil.test'), '/orders');
  assert.equal(helpers.historyPath(1), '/orders?page=1');
});

test('payment configuration loading and failure block intent creation with a retry path', async () => {
  for (const pending of [true,false]) {
    const state={data:undefined,isPending:pending,isError:!pending,refetch:async()=>{}};
    const page=fixture('screens/Payment.tsx','PaymentSetup',{queries:{'customer-payment-configuration':state}});
    assert.match(page.text(),pending?/Loading secure payment options/:/Online payment is unavailable/);
    assert.equal(page.calls.some(call=>call[0]==='createPaymentIntent'),false);
    if(!pending) assert.ok(page.button('Retry payment options'));
    const configuration=page.queryOptions.find(query=>query.queryKey[0]==='customer-payment-configuration');
    assert.equal(configuration.queryKey[1],page.session.key);assert.equal(configuration.retry,false);page.unmount();
  }
});

test('checkout recovery never changes its saved request and only authoritative write rejection releases it', async () => {
  const page = fixture('lib/customerCheckoutAction.ts'); const { executeCheckoutRequest } = page.module;
  const params = { session: page.session, mode: 'save', signal: new AbortController().signal, current: () => true };
  const result = await executeCheckoutRequest(params); assert.equal(result.id, order.id); assert.equal(page.calls.filter(call => call[0] === 'createOrder').length, 1);
  assert.deepEqual(page.stored.calls.map(call => call[0]), ['prepare','uncertain','accept']);
  for (const status of [0, 404, 409, 500, 400, 422]) {
    const failed = fixture('lib/customerCheckoutAction.ts', null, { api: { createOrder: async () => { throw new CustomerRequestError('Failed', status); } } });
    await assert.rejects(failed.module.executeCheckoutRequest({ ...params, session: failed.session }));
    assert.equal(!!failed.stored.state.checkoutRequest, ![400, 422].includes(status));
  }
  const recovery = fixture('lib/customerCheckoutAction.ts', null, { store: storeFixture({ checkoutRequest: { requestId: 'same-key', revision: 7, payload, phase: 'unknown' } }), api: { recoverOrder: async () => { throw new CustomerRequestError('Missing', 404); } } });
  await assert.rejects(recovery.module.executeCheckoutRequest({ ...params, session: recovery.session, mode: 'recover' }));
  assert.equal(recovery.stored.state.checkoutRequest.requestId, 'same-key');
  await recovery.module.executeCheckoutRequest({ ...params, session: recovery.session, mode: 'resubmit' });
  assert.equal(recovery.calls.find(call => call[0] === 'createOrder')[2], 'same-key');
});

test('only an authoritative retired-request response releases the saved request', async () => {
  for (const mode of ['save', 'recover', 'resubmit']) {
    const stored = storeFixture({ checkoutRequest: { requestId: 'retired-key', revision: 7, payload, phase: 'unknown' } });
    const retire = async () => { throw new CustomerRequestError('This order was retired.', 410, 'ORDER_RETIRED'); };
    const page = fixture('lib/customerCheckoutAction.ts', null, { store: stored, api: { createOrder: retire, recoverOrder: retire } });
    await assert.rejects(page.module.executeCheckoutRequest({ session: page.session, mode, signal: new AbortController().signal, current: () => true }), error => error.code === 'ORDER_RETIRED');
    assert.equal(stored.state.checkoutRequest, null);
    assert.deepEqual(stored.calls.find(call => call[0] === 'reject'), ['reject', 'retired-key', 7]);
    assert.equal(stored.calls.filter(call => call[0] === 'accept').length, 0);
  }
  const unknown = fixture('lib/customerCheckoutAction.ts', null, { api: { createOrder: async () => { throw new CustomerRequestError('Unknown response', 410); } } });
  await assert.rejects(unknown.module.executeCheckoutRequest({ session: unknown.session, mode: 'save', signal: new AbortController().signal, current: () => true }));
  assert.ok(unknown.stored.state.checkoutRequest);
});

test('late create results do not accept or navigate after revision change or unmount', async () => {
  for (const invalidate of [page => { page.stored.state.revision++; }, page => page.unmount(), page => page.setCurrent(false)]) {
    const pending = deferred(); const page = fixture('screens/OrderSummary.tsx', 'PrepareSummary', { api: { createOrder: () => pending.promise } });
    const first = page.button('Save details and view price').props.onClick(); await page.flush();
    invalidate(page); pending.resolve(order); await first; await page.flush();
    assert.equal(page.stored.calls.filter(call => call[0] === 'accept').length, 0); assert.equal(page.navigation.length, 0); assert.ok(page.stored.state.checkoutRequest);
  }
});

test('summary creates only on explicit submit and synchronously blocks duplicates', async () => {
  const pending = deferred(); const page = fixture('screens/OrderSummary.tsx', 'PrepareSummary', { api: { createOrder: () => pending.promise } });
  assert.equal(page.calls.length, 0); const click = page.button('Save details and view price').props.onClick;
  click(); click(); await page.flush(); assert.equal(page.calls.filter(call => call[0] === 'createOrder').length, 1);
  pending.resolve(order); await page.flush(); assert.equal(page.stored.calls.filter(call => call[0] === 'accept').length, 1);
  assert.equal(page.navigation[0][0], '/summary?orderId=SR-order-a');
});

test('payment receipt helpers reject amount, owner and intent mismatches', () => {
  const helpers = fixture('lib/customerPaymentState.ts').module;
  assert.equal(helpers.paymentIntentForOrder(intent, order), intent);
  for (const patch of [{ amountCents: 1 }, { guestId: 'other' }, { orderId: 'other' }, { currency: 'eur' }]) assert.throws(() => helpers.paymentIntentForOrder({ ...intent, ...patch }, order));
  assert.throws(() => helpers.paymentIntentForOrder(intent, { ...order, paymentIntentId: 'pi_other' }));
  assert.equal(helpers.verifiedStripeResult({ id: intent.paymentIntentId, amount: 1234, currency: 'usd', status: 'processing' }, intent), 'processing');
  for (const value of [undefined, { id: 'pi_other', amount: 1234, currency: 'usd' }, { id: intent.paymentIntentId, amount: 1, currency: 'usd' }]) assert.throws(() => helpers.verifiedStripeResult(value, intent));
});

test('SDK deadline and cancellation settle without accepting a late result', async () => {
  const { waitForPaymentSdk } = fixture('lib/customerPaymentState.ts').module;
  const late = deferred(); let accepted = 0; const controller = new AbortController();
  await assert.rejects(waitForPaymentSdk(late.promise, controller.signal, 5).then(() => accepted++), error => error.code === 'SDK_TIMEOUT');
  late.resolve({ status: 'succeeded' }); await new Promise(setImmediate); assert.equal(accepted, 0);
  const cancelled = deferred(); const pending = waitForPaymentSdk(cancelled.promise, controller.signal, 1000); controller.abort();
  await assert.rejects(pending, error => error.code === 'SDK_ABORTED');
});

test('payment setup uses server amount and keeps processing out of the form', async () => {
  const page = fixture('screens/Payment.tsx', 'PaymentSetup', { api: { createPaymentIntent: async () => ({ ...intent, status: 'processing' }) } });
  page.button('Check payment and load methods').props.onClick(); await page.flush();
  assert.match(page.text(), /still processing/); assert.ok(!page.all().some(node => node.type === 'Elements'));
  assert.equal(page.navigation.length, 0); assert.ok(page.button('Check payment status'));
});

test('an expired uncertain payment offers support without a new charge retry', async () => {
  const error = new CustomerRequestError('This payment needs support review.', 409, 'PAYMENT_RECONCILIATION_REQUIRED');
  const page = fixture('screens/Payment.tsx', 'PaymentSetup', { api: { createPaymentIntent: async () => { throw error; } } });
  page.button('Check payment and load methods').props.onClick(); await page.flush();
  assert.ok(!page.all().some(node => node.type === 'Elements' || (node.type === 'button' && /load methods|Check payment status/.test(node.props.children))));
  assert.equal(page.find(node => node.type === 'ReadError').props.error, error);
  assert.equal(page.navigation.length, 0); assert.equal(page.calls.filter(call => call[0] === 'confirmPayment').length, 0);
  let retried = 0;
  const recovery = fixture('components/customer/CustomerUI.tsx', 'ReadError', { props: { error, retry: () => retried++ } });
  assert.ok(recovery.all().some(node => node.type === 'Link' && node.props.to === '/support'));
  assert.ok(!recovery.all().some(node => node.type === 'button'));
  assert.equal(retried, 0);
});

test('card and wallet callbacks share a synchronous payment lock and use a verified backend receipt', async () => {
  const pending = deferred(); let confirmations = 0; const page = fixture('screens/Payment.tsx', 'PaymentForm', { action: true, stripe: { confirmPayment: () => { confirmations++; return pending.promise; } } });
  const submit = page.find(node => node.type === 'form').props.onSubmit; submit({ preventDefault() {} });
  const wallet = page.find(node => node.type === 'ExpressCheckoutElement'); let failed = 0; wallet.props.onConfirm({ paymentFailed: () => failed++ });
  await page.flush(); assert.equal(confirmations, 1); assert.equal(failed, 1);
  pending.resolve({ paymentIntent: { id: intent.paymentIntentId, amount: 1234, currency: 'usd', status: 'succeeded' } }); await page.flush();
  assert.equal(page.calls.filter(call => call[0] === 'confirmPayment').length, 1); assert.equal(page.navigation[0][0], '/confirmation?orderId=SR-order-a');
});

test('payment processing and failed backend reconciliation release busy without false success', async () => {
  for (const options of [
    { stripe: { confirmPayment: async () => ({ paymentIntent: { id: intent.paymentIntentId, amount: 1234, currency: 'usd', status: 'processing' } }) } },
    { api: { confirmPayment: async () => { throw new CustomerRequestError('Unconfirmed', 500); } } },
  ]) {
    const page = fixture('screens/Payment.tsx', 'PaymentForm', { action: true, ...options });
    page.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await page.flush();
    assert.equal(page.navigation.length, 0); assert.equal(page.button('Check payment status').props.disabled, false);
    assert.ok(!page.all().some(node => node.type === 'PaymentElement'));
  }
});

test('payment unmount or changed session ignores a late Stripe success', async () => {
  for (const invalidate of [page => page.unmount(), page => page.setCurrent(false)]) {
    const pending = deferred(); const page = fixture('screens/Payment.tsx', 'PaymentForm', { action: true, stripe: { confirmPayment: () => pending.promise } });
    page.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await page.flush(); invalidate(page);
    pending.resolve({ paymentIntent: { id: intent.paymentIntentId, amount: 1234, currency: 'usd', status: 'succeeded' } }); await page.flush();
    assert.equal(page.calls.filter(call => call[0] === 'confirmPayment').length, 0); assert.equal(page.navigation.length, 0);
  }
});

test('a hung Stripe confirmation unlocks only status recovery and ignores late success', async () => {
  const pending = deferred(); const page = fixture('screens/Payment.tsx', 'PaymentForm', { action: true, sdkTimeoutMs: 5, stripe: { confirmPayment: () => pending.promise } });
  page.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setTimeout(resolve, 20)); await page.flush();
  assert.match(page.text(), /took too long/); assert.equal(page.button('Check payment status').props.disabled, false);
  assert.ok(!page.all().some(node => node.type === 'PaymentElement'));
  pending.resolve({ paymentIntent: { id: intent.paymentIntentId, amount: 1234, currency: 'usd', status: 'succeeded' } }); await page.flush();
  assert.equal(page.calls.filter(call => call[0] === 'confirmPayment').length, 0); assert.equal(page.navigation.length, 0);
});

test('express wallets are only described when Stripe reports availability', () => {
  const page = fixture('screens/Payment.tsx', 'PaymentForm', { action: true });
  page.find(node => node.type === 'ExpressCheckoutElement').props.onReady({ availablePaymentMethods: undefined }); page.render();
  assert.equal(page.find(node => node.props?.className === 'customer-wallet').props.hidden, true);
  page.find(node => node.type === 'ExpressCheckoutElement').props.onReady({ availablePaymentMethods: { applePay: true } }); page.render();
  assert.equal(page.find(node => node.props?.className === 'customer-wallet').props.hidden, false);
  assert.match(page.text(), /Or choose another method/);
});

test('history is server-scoped, cancellable, paginated and hides denied cached data', async () => {
  const page = fixture('screens/OrderHistory.tsx', 'History', { props: { page: 3, status: 'in_transit' }, query: { data: { orders: [], pagination: { page: 3, limit: 20, total: 2, pages: 1 } } } });
  const query = page.queryOptions.at(-1); assert.deepEqual(Array.from(query.queryKey), ['customer-orders', 'guest-a:g1', 3, 'in_transit']); assert.equal(query.retry, false);
  const signal = new AbortController().signal; await query.queryFn({ signal }); assert.equal(page.calls.find(call => call[0] === 'listOrders')[2], signal);
  assert.ok(page.all().some(node => node.type === 'Link' && node.props.to === '/orders?page=2&status=in_transit'));
  page.setQuery({ data: { orders: [order], pagination: { page: 3, limit: 20, total: 1, pages: 1 } }, isError: true, error: new CustomerRequestError('Denied', 403) });
  assert.doesNotMatch(page.text(), /SR-order-a|Dallas/);
  page.setQuery({ isError: true, error: new CustomerRequestError('Missing', 404) }); assert.doesNotMatch(page.text(), /SR-order-a|Dallas/);
});

test('saved summary requires a fresh successful read before payment', () => {
  const page = fixture('screens/OrderSummary.tsx', 'SavedSummary');
  assert.ok(page.all().some(node => node.type === 'Link' && node.props.to === '/payment?orderId=SR-order-a'));
  page.setQuery({ isError: true, error: new CustomerRequestError('Offline', 500) }); assert.ok(!page.all().some(node => node.type === 'Link' && node.props.to.startsWith('/payment')));
  page.setQuery({ isError: false, isFetchedAfterMount: false }); assert.match(page.text(), /Verifying/); assert.ok(!page.all().some(node => node.type === 'OrderDetails'));
});

test('missing or retained-away orders hide cached private details on every order screen', () => {
  for (const [file, component] of [['OrderSummary','SavedSummary'], ['Payment','PaymentOrder'], ['Confirmation','ConfirmationStatus']]) {
    const page = fixture('screens/' + file + '.tsx', component, { query: { data: order, isError: true, error: new CustomerRequestError('Missing', 404) } });
    assert.ok(!page.all().some(node => ['OrderDetails','OrderPrice'].includes(node.type)), component);
  }
  const chat = fixture('screens/Chat.tsx', 'ChatStatus', { query: { data: { available: false, messages: [{ id: 'a', orderId: order.id, message: 'Private message', sender: 'customer', timestamp: order.createdAt }] }, isError: true, error: new CustomerRequestError('Missing', 404) } });
  assert.doesNotMatch(chat.text(), /Private message|Courier chat is not connected/);
  const base = { isFetchedAfterMount: true, isError: false, isPending: false, dataUpdatedAt: Date.parse(order.updatedAt), refetch: async () => {} };
  const queries = { 'customer-order': { ...base, data: order }, 'customer-tracking': { ...base, data: { guestId: order.guestId, orderId: order.id, status: 'confirmed', paymentStatus: 'paid', availability: 'recorded', timeline: [] } } };
  const tracking = fixture('screens/Tracking.tsx', 'TrackingStatus', { queries });
  assert.ok(tracking.all().some(node => node.type === 'OrderDetails'));
  queries['customer-tracking'] = { ...queries['customer-tracking'], isError: true, error: new CustomerRequestError('Missing', 404) }; tracking.render();
  assert.ok(!tracking.all().some(node => node.type === 'OrderDetails')); assert.doesNotMatch(tracking.text(), /Payment is confirmed|Recorded events/);
});

test('chat is unavailable without a sending control and errors are not an empty conversation', () => {
  const page = fixture('screens/Chat.tsx', 'ChatStatus', { query: { data: { available: false, messages: [] } } });
  assert.match(page.text(), /Courier chat is not connected/); assert.ok(!page.all().some(node => ['form','textarea','input'].includes(node.type)));
  page.setQuery({ isError: true, error: new CustomerRequestError('Denied', 403) }); assert.doesNotMatch(page.text(), /Courier chat is not connected/); assert.ok(page.all().some(node => node.type === 'ReadError'));
});

test('support FAQ uses controlled accessible panels and avoids false delivery/support guarantees', () => {
  const page = fixture('screens/SupportPage.tsx', 'SupportPage');
  const first = page.button('How do I arrange a delivery? +'); assert.equal(first.props['aria-expanded'], false);
  first.props.onClick(); page.render(); const opened = page.button('How do I arrange a delivery? −'); assert.equal(opened.props['aria-expanded'], true);
  assert.equal(page.find(node => node.props?.id === opened.props['aria-controls']).props.hidden, false);
  assert.doesNotMatch(page.text(), /no monthly fees|within minutes|within a few hours|Setup takes|real-time location on a map/);
  assert.match(page.text(), /90 days after each order is completed/);
});

test('input labels and error descriptions are unique even when address labels repeat', () => {
  const page = fixture('components/ui/Input.tsx', 'Input', { props: { label: 'City', error: 'Required', required: true } });
  const input = page.find(node => node.type === 'input'); const label = page.find(node => node.type === 'label');
  assert.equal(label.props.htmlFor, input.props.id); assert.equal(input.props['aria-invalid'], true);
  assert.equal(page.find(node => node.props?.id === input.props['aria-describedby']).props.children, 'Required');
  const source = fs.readFileSync(path.join(root, 'components/ui/Input.tsx'), 'utf8'); assert.match(source, /useId\(/); assert.doesNotMatch(source, /label\?\.toLowerCase/);
});

test('customer shell has stable back/home routes, real legal links and current progress semantics', () => {
  const page = fixture('components/layout/AppShell.tsx', 'AppShell', { props: { showBack: true, backTo: '/summary?orderId=SR-order-a', step: 3, children: 'Checkout' } });
  assert.ok(page.all().some(node => node.type === 'Link' && node.props.to === '/order'));
  assert.ok(!page.all().some(node => node.type === 'Link' && node.props.to === '/'));
  assert.ok(page.all().some(node => node.type === 'li' && node.props['aria-current'] === 'step'));
  assert.ok(page.all().some(node => node.type === 'Link' && node.props.to === '/summary?orderId=SR-order-a'));
});
