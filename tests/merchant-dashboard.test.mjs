import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
const { QueryClient, QueryObserver } = frontendRequire('@tanstack/react-query');
const files = {
  session: ['../frontend/src/api/merchantSession.ts', ''],
  client: ['../frontend/src/api/merchantDashboardApi.ts', ''],
  page: ['../frontend/src/screens/MerchantDashboard.tsx', '\nexport { MerchantDashboardSession, OverviewPanel, OrdersPanel, OrderComposer, SettingsEditor, SettingsPanel, BillingPanel, TeamPanel, Pagination, OrdersList };'],
};
const compiled = Object.fromEntries(Object.entries(files).map(([key, [path, suffix]]) => [key, ts.transpileModule((readFileSync(new URL(path, import.meta.url), 'utf8') + suffix).replaceAll('import.meta.env', '({})'), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText]));
const iso = '2026-10-17T12:00:00.000Z', owner = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const ownership = { standalone: 'owned_records_only', shopify: 'not_linked', linked_shop_count: 0, historical_unassigned: 'excluded' };
const record = (changes = {}) => ({ id: 'record-1', merchant_id: owner, source: 'standalone', source_order_id: 'record-1', status: 'pending', service_type: 'merchant_manual_record',
  customer_name: 'Customer', customer_phone: null, customer_email: null, delivery_address: '123 Main Street', declared_amount_cents: 1000, items: [], created_at: iso, updated_at: iso, completed_at: null, payment_status: 'unpaid', ...changes });
const orderPage = (rows = [record()], changes = {}) => ({ orders: rows, pagination: { page: 1, limit: 20, total: rows.length, pages: rows.length ? 1 : 0, ...changes }, ownership });
const overview = () => ({ merchant: { id: owner, store_name: 'Example Store', plan: 'growth', plan_status: 'active' }, stats: { active: 0, pending: 1, completed_today: 0, failed: 0, total: 1, completion_time_unknown: 0 }, recent_orders: [record()], ownership, stats_scope: 'all_owned_orders', completion_timezone: 'UTC' });
const settings = () => ({ store_name: 'Example Store', store_address: '123 Main Street', store_phone: '', city: '', state: '', zip: '', email: 'owner@example.test', first_name: 'First', last_name: 'Last' });
const staff = (changes = {}) => ({ id: 'staff-1', email: 'staff@example.test', role: 'staff', first_name: null, last_name: null, is_active: true, created_at: iso, ...changes });
const context = { tab: 'orders', status: '', page: 1, trackingPage: 1 };
const signal = () => new AbortController().signal;
const flush = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);

function fixture(options = {}) {
  const calls = [], invalidations = [], navigations = [], redirects = [], storage = new Map(), modules = new Map(), queries = [];
  const identity = { key: 'session-a', owner };
  let params = new URLSearchParams(options.search || '?tab=orders'), active;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const invalidate = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = (...args) => { invalidations.push(args[0]); return invalidate(...args); };
  let behavior = async (path, init) => {
    if (path.endsWith('/dashboard')) return overview();
    if (path.includes('/orders?')) return orderPage();
    if (path.endsWith('/settings')) return settings();
    if (path.endsWith('/billing/portal')) return { portal_url: 'https://billing.stripe.com/p/session-test' };
    if (path.endsWith('/billing')) return { invoices: [], plan: 'growth', plan_status: 'active' };
    if (path.endsWith('/team')) return init.method === 'POST' ? { staff_member: staff() } : { staff: [] };
    if (path.endsWith('/orders')) return { order: record(), replayed: false };
    throw new Error('Unhandled fixture request: ' + path);
  };
  const react = {
    useState(initial) { const i = active.cursor++, instance = active; if (!(i in instance.cells)) instance.cells[i] = typeof initial === 'function' ? initial() : initial; return [instance.cells[i], value => { instance.writes++; instance.cells[i] = typeof value === 'function' ? value(instance.cells[i]) : value; }]; },
    useMemo(factory, deps) { const i = active.cursor++, previous = active.cells[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) active.cells[i] = { deps, value: factory() }; return active.cells[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useRef(initial) { return react.useMemo(() => ({ current: initial }), []); },
    useLayoutEffect(effect, deps) { const i = active.cursor++, previous = active.effectDeps[i]; if (!previous || deps.some((value, index) => value !== previous[index])) { active.effectDeps[i] = deps; active.effects.push({ i, effect }); } },
  };
  react.useEffect = react.useLayoutEffect;
  let currentSession;
  function load(key) {
    if (modules.has(key)) return modules.get(key).exports;
    const module = { exports: {} }; modules.set(key, module);
    vm.runInNewContext(compiled[key], {
      module, exports: module.exports, Error, URL, URLSearchParams, AbortController, Headers, setTimeout, clearTimeout, Intl, crypto: { randomUUID },
      sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (options.storageFails) throw new Error('Storage disabled'); storage.set(key, value); }, removeItem: key => storage.delete(key) },
      window: { location: { assign: url => redirects.push(url) } },
      require(name) {
        if (name.endsWith('merchantSession')) return load('session');
        if (name.endsWith('merchantDashboardApi')) return load('client');
        if (name.endsWith('useMerchantSession')) return { useMerchantSession: () => ({ ...currentSession, loading: false }) };
        if (name.endsWith('merchantAuthState')) return { useMerchantAuth: () => ({ merchant: { id: identity.owner, store_name: 'Example Store', plan: 'growth' }, logout: async () => {} }) };
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }), Fragment: 'Fragment' };
        if (name === 'react-router-dom') return { Link: 'Link', useNavigate: () => (...args) => navigations.push(args), useSearchParams: () => [params, next => { params = next; }] };
        if (name === '@tanstack/react-query') return { useQuery(query) {
          const i = active.cursor++;
          if (!active.cells[i]) { const observer = new QueryObserver(queryClient, query); active.cells[i] = { observer, unsubscribe: observer.subscribe(() => {}) }; }
          else active.cells[i].observer.setOptions(query);
          queries.push(query); return active.cells[i].observer.getCurrentResult();
        }, useQueryClient: () => queryClient };
        if (name.endsWith('.jpg')) return 'fixture-logo.jpg';
        if (name.endsWith('.css')) return {};
        throw new Error('Unhandled import ' + name);
      },
    });
    return module.exports;
  }
  function newSession() {
    const key = identity.key, owned = identity.owner;
    const session = { key, owner: owned, current: () => key === identity.key && owned === identity.owner,
      assertCurrent() { if (!session.current()) throw load('session').staleMerchantSession(); },
      async request(path, init = {}) { session.assertCurrent(); if (init.signal?.aborted) throw new Error('aborted'); calls.push({ path, init }); const value = await behavior(path, init); session.assertCurrent(); if (init.signal?.aborted) throw new Error('aborted'); return value; } };
    return session;
  }
  currentSession = newSession();
  function mount(name, extra = {}) {
    const session = currentSession, api = load('client').createMerchantDashboardApi(session);
    const instance = { cursor: 0, cells: [], effects: [], cleanups: [], effectDeps: [], writes: 0, tree: null };
    function render() {
      active = instance; instance.cursor = 0;
      instance.tree = load('page')[name]({ session, api, context: load('client').parseDashboardLocation(params), ...extra });
      for (const { i, effect } of instance.effects.splice(0)) { instance.cleanups[i]?.(); instance.cleanups[i] = effect(); }
      return instance.tree;
    }
    render();
    return { instance, render, nodes: () => walk(instance.tree), text: () => text(instance.tree),
      async settle() { for (let i = 0; i < 3; i++) { await flush(); render(); } },
      button(name) { const node = walk(instance.tree).find(node => node.type === 'button' && (text(node) === name || node.props['aria-label'] === name)); assert.ok(node, 'Missing button: ' + name); return node; },
      input(id) { const node = walk(instance.tree).find(node => node.props?.id === id); assert.ok(node, 'Missing input: ' + id); return node; },
      form() { const node = walk(instance.tree).find(node => node.type === 'form'); assert.ok(node, 'Missing form'); return node; },
      unmount() { instance.cleanups.forEach(cleanup => cleanup?.()); instance.cells.forEach(cell => cell?.unsubscribe?.()); queryClient.clear(); },
    };
  }
  return { calls, invalidations, navigations, redirects, storage, queries, queryClient, mount,
    helpers: () => load('client'), api: () => load('client').createMerchantDashboardApi(currentSession), error: (...args) => new (load('session').MerchantRequestError)(...args),
    setBehavior: value => { behavior = value; }, rotate() { identity.key = 'session-b'; identity.owner = 'other-owner'; currentSession = newSession(); },
    get params() { return params; }, get session() { return currentSession; },
  };
}
const submit = page => page.form().props.onSubmit({ preventDefault() {} });
function fillOrder(page) {
  for (const [id, value] of [['manual-customer', 'Customer'], ['manual-address', '123 Main Street'], ['manual-amount', '10.00']]) { page.input(id).props.onChange({ target: { value } }); page.render(); }
}


test('all six sections retain order and tracking navigation context, and Team remains reachable', () => {
  const f = fixture({ search: '?tab=team&status=driver_assigned&page=4&trackingPage=2' }), page = f.mount('MerchantDashboardSession');
  const links = page.nodes().filter(node => node.type === 'Link' && node.props['aria-current'] !== undefined);
  assert.equal(links.length, 1); assert.match(links[0].props.to, /tab=team/);
  for (const tab of f.helpers().dashboardTabs) assert.ok(page.nodes().some(node => node.type === 'Link' && node.props.to === '/merchant/dashboard?tab=' + tab + '&status=driver_assigned&page=4&trackingPage=2'));
  const url = new URL(f.helpers().orderDetailPath('id/one', f.helpers().parseDashboardLocation(f.params)), 'https://example.test');
  assert.equal(url.searchParams.get('returnTo'), '/merchant/dashboard?tab=team&status=driver_assigned&page=4&trackingPage=2');
  assert.match(url.pathname, /id%2Fone/); page.unmount();
});
test('invalid navigation values fall back safely and zero declared value is distinct from missing data', () => {
  const f = fixture(), h = f.helpers();
  assert.equal(h.parseDashboardLocation(new URLSearchParams('tab=unknown&page=-1&trackingPage=Infinity&status=bogus')).tab, 'overview');
  assert.equal(h.parseDashboardLocation(new URLSearchParams('page=-1')).page, 1);
  assert.equal(h.money(null), 'Not recorded'); assert.equal(h.money(0), '$0.00');
  assert.equal(h.dollarsToCents('0.29'), 29); assert.equal(h.dollarsToCents('12.1'), 1210);
  for (const invalid of ['-1', '1.001', '1e3', 'Infinity', '', '900719925474099100']) assert.throws(() => h.dollarsToCents(invalid));
});
for (const change of [{ merchant_id: 'other' }, { declared_amount_cents: -1 }, { created_at: 'not-a-date' }, { items: [{ name: 'Item', quantity: 0 }] }, { customer_name: {} }]) {
  test('owned order validation rejects ' + JSON.stringify(change), async () => {
    const f = fixture(); f.setBehavior(async () => orderPage([record(change)]));
    await assert.rejects(f.api().orders({ page: 1, limit: 20 }, signal()), /could not be verified/);
  });
}
test('list validates pagination, requested filter, duplicate IDs, and complete active statuses', async () => {
  const f = fixture();
  for (const data of [orderPage([record(), record()]), orderPage([], { total: 2, pages: 1 }), orderPage([record()], { page: 2 }), orderPage([record()], { pages: 3 })]) {
    f.setBehavior(async () => data); await assert.rejects(f.api().orders({ page: 1, limit: 20 }, signal()), /could not be verified/);
  }
  for (const status of f.helpers().activeOrderStatuses) {
    f.setBehavior(async () => orderPage([record({ status })])); assert.equal((await f.api().orders({ page: 1, limit: 20, active: true }, signal())).orders[0].status, status);
  }
  f.setBehavior(async () => orderPage([record({ status: 'delivered' })])); await assert.rejects(f.api().orders({ page: 1, limit: 20, active: true }, signal()));
  const before = f.calls.length; await assert.rejects(f.api().orders({ page: 0, limit: 20 }, signal())); assert.equal(f.calls.length, before);
});
test('tracking reads the requested active page rather than recent overview orders', async () => {
  const f = fixture({ search: '?tab=tracking&trackingPage=3' });
  f.setBehavior(async () => orderPage([], { page: 3 }));
  const page = f.mount('OrdersPanel', { tracking: true }); await page.settle();
  assert.match(f.calls[0].path, /page=3&limit=20&active=true/);
  assert.equal(f.queries[0].refetchInterval, 15000);
  assert.ok(page.nodes().some(node => typeof node.type === 'function' && node.type.name === 'Pagination'));
  assert.match(page.text(), /This page no longer contains orders/); page.unmount();
});
test('New Order opens the composer without leaving Orders; status changes reset only its page', async () => {
  const f = fixture({ search: '?tab=orders&page=4&trackingPage=2' });
  f.setBehavior(async () => orderPage([], { page: 4 }));
  const page = f.mount('OrdersPanel'); await page.settle();
  page.button('New Order').props.onClick(); page.render();
  assert.equal(f.navigations.length, 0); assert.ok(page.nodes().some(node => node.type.name === 'OrderComposer'));
  page.input('merchant-status').props.onChange({ target: { value: 'delivered' } });
  assert.equal(f.params.get('status'), 'delivered'); assert.equal(f.params.get('page'), null); assert.equal(f.params.get('trackingPage'), '2'); page.unmount();
});
test('failed overview and settings reads render failure instead of zero statistics or an editable blank profile', async () => {
  for (const name of ['OverviewPanel', 'SettingsPanel']) {
    const f = fixture(); f.setBehavior(async () => { throw new Error('offline'); });
    const page = f.mount(name); await page.settle();
    assert.ok(page.nodes().some(node => node.type.name === 'Failure'));
    assert.ok(!page.nodes().some(node => node.type.name === 'SettingsEditor'));
    assert.doesNotMatch(page.text(), /No owned orders have been recorded|Current status counts/); page.unmount();
  }
});
test('invalid overview scope, owner, or statistics cannot become a successful dashboard', async () => {
  const f = fixture();
  for (const data of [{ ...overview(), stats_scope: 'recent_five' }, { ...overview(), merchant: { ...overview().merchant, id: 'other' } }, { ...overview(), stats: { ...overview().stats, active: '0' } }]) {
    f.setBehavior(async () => data); await assert.rejects(f.api().dashboard(signal()), /could not be verified/);
  }
});
test('create and recovery receipts must match the exact request and owned order', async () => {
  const f = fixture(), input = { request_id: requestId, customer_name: 'Customer', delivery_address: '123 Main Street', declared_amount_cents: 1000, items: [] };
  f.setBehavior(async () => ({ order: record(), request_id: requestId, replayed: false }));
  assert.equal((await f.api().createOrder(input, signal())).id, 'record-1');
  assert.equal((await f.api().recoverOrder(requestId, signal())).id, 'record-1');
  for (const receipt of [{ order: record(), replayed: true }, { order: record(), request_id: randomUUID(), replayed: false }, { order: record({ customer_name: 'Wrong' }), request_id: requestId, replayed: false }]) {
    f.setBehavior(async () => receipt); await assert.rejects(f.api().createOrder(input, signal()), /could not be verified/);
  }
  f.setBehavior(async () => ({ order: record(), request_id: randomUUID() }));
  await assert.rejects(f.api().recoverOrder(requestId, signal()), /could not be verified/);
});
test('a duplicate click cannot submit twice, and an uncertain retry reuses identical payload and recovery ID', async () => {
  const f = fixture(), pending = deferred(); f.setBehavior(() => pending.promise);
  const page = f.mount('OrderComposer', { close() {} }); fillOrder(page);
  const first = submit(page), duplicate = submit(page); await flush();
  assert.equal(f.calls.length, 1); pending.reject(f.error('Not confirmed', 0, 'TIMEOUT'));
  await Promise.all([first, duplicate]); page.render();
  assert.equal(page.button('Retry same request').props.disabled, false);
  const original = f.calls[0].init.body, body = JSON.parse(original);
  assert.equal(f.storage.size, 1); assert.equal([...f.storage.values()][0], body.request_id); assert.ok(![...f.storage.values()][0].includes('Customer'));
  f.setBehavior(async () => ({ order: record(), request_id: body.request_id, replayed: true }));
  await submit(page); page.render();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].init.body, original);
  assert.match(page.text(), /saved record is confirmed/); assert.equal(f.storage.size, 0); assert.equal(f.invalidations.length, 1); page.unmount();
});
test('validation rejection unlocks fields while conflict and uncertain outcomes keep the submitted payload locked', async () => {
  for (const status of [400, 409, 500]) {
    const f = fixture(); f.setBehavior(async () => { throw f.error('Rejected', status); });
    const page = f.mount('OrderComposer', { close() {} }); fillOrder(page); await submit(page); await page.settle();
    const fieldset = page.nodes().find(node => node.type === 'fieldset');
    assert.equal(fieldset.props.disabled, status !== 400);
    if (status === 409) assert.equal(page.button('Retry same request').props.disabled, true);
    page.unmount();
  }
});
test('manual creation is blocked if its recovery identity cannot be retained', async () => {
  const f = fixture({ storageFails: true }), page = f.mount('OrderComposer', { close() {} }); fillOrder(page);
  await submit(page); page.render(); assert.equal(f.calls.length, 0); assert.ok(page.nodes().some(node => node.type.name === 'Failure')); page.unmount();
});
for (const transition of ['unmount', 'rotate']) {
  test('late order receipt after ' + transition + ' cannot mutate a new route or clear its recovery record', async () => {
    const f = fixture(), pending = deferred(); f.setBehavior(() => pending.promise);
    const page = f.mount('OrderComposer', { close() {} }); fillOrder(page); const result = submit(page); await flush();
    const writes = page.instance.writes, body = JSON.parse(f.calls[0].init.body);
    if (transition === 'unmount') page.unmount(); else f.rotate();
    pending.resolve({ order: record(), request_id: body.request_id, replayed: false }); await result;
    assert.equal(page.instance.writes, writes); assert.equal(f.storage.size, 1); assert.equal(f.invalidations.length, 0);
    if (transition !== 'unmount') page.unmount();
  });
}
test('reopening an interrupted form recovers the original saved record without another POST', async () => {
  const f = fixture(); f.helpers().rememberOrderRequest(owner, requestId);
  f.setBehavior(async () => ({ order: record(), request_id: requestId }));
  const page = f.mount('OrderComposer', { close() {} }); await page.settle();
  assert.equal(f.calls.length, 1); assert.match(f.calls[0].path, /orders\/requests\//);
  assert.match(page.text(), /saved record is confirmed/); assert.equal(f.storage.size, 0); page.unmount();
});


test('settings update verifies all returned writable fields and an uncertain save requires a fresh read', async () => {
  const f = fixture(); f.setBehavior(async () => ({ ...settings(), store_name: 'Wrong Store' }));
  await assert.rejects(f.api().updateSettings(settings(), signal()), /could not be verified/);
  const page = f.mount('SettingsEditor', { value: settings() }); await submit(page); page.render();
  assert.equal(page.button('Save settings').props.disabled, true);
  f.setBehavior(async () => settings()); await page.button('Reload saved settings').props.onClick(); await page.settle();
  assert.equal(page.button('Save settings').props.disabled, false); assert.match(page.text(), /Saved settings loaded/); page.unmount();
});
test('late settings save cannot populate a different session cache', async () => {
  const f = fixture(), pending = deferred(); f.setBehavior(() => pending.promise);
  const page = f.mount('SettingsEditor', { value: settings() }), result = submit(page); await flush();
  const writes = page.instance.writes; f.rotate(); pending.resolve(settings()); await result;
  assert.equal(page.instance.writes, writes); assert.equal(f.queryClient.getQueryData(['merchant-dashboard', 'session-b', 'settings']), undefined); page.unmount();
});
test('billing records reject invalid amounts and portal destination is constrained', async () => {
  const f = fixture();
  f.setBehavior(async () => ({ invoices: [{ id: 'invoice-1', amount_cents: -1, status: 'paid', created_at: iso, period_start: null, period_end: null }], plan: 'growth', plan_status: 'active' }));
  await assert.rejects(f.api().billing(signal()), /could not be verified/);
  for (const url of ['http://billing.stripe.com/a', 'https://billing.stripe.com.evil.test/a', 'https://user@billing.stripe.com/a', 'https://billing.stripe.com:444/a']) {
    f.setBehavior(async () => ({ portal_url: url })); await assert.rejects(f.api().billingPortal(signal()), /could not be verified/);
  }
  const portalUrl = 'https://billing.stripe.com/p/session-safe#opaque-provider-data';
  f.setBehavior(async () => ({ portal_url: portalUrl })); assert.equal(await f.api().billingPortal(signal()), portalUrl);
});
test('billing failures do not become empty invoices; account changes block late portal navigation', async () => {
  const f = fixture(), pending = deferred();
  f.setBehavior(async path => { if (path.endsWith('/portal')) return pending.promise; throw f.error('Invoice access denied', 403); });
  const page = f.mount('BillingPanel'); await page.settle();
  assert.ok(page.nodes().some(node => node.type.name === 'Failure')); assert.doesNotMatch(page.text(), /No invoices/);
  assert.equal(page.button('Manage billing').props.disabled, false);
  const result = page.button('Manage billing').props.onClick(); await flush(); f.rotate();
  pending.resolve({ portal_url: 'https://billing.stripe.com/p/safe' }); await result; await flush();
  assert.equal(f.redirects.length, 0); page.unmount();
});
test('non-Growth Team explains actual access without issuing a roster read or implying an account upgrade', () => {
  const f = fixture(), page = f.mount('TeamPanel', { plan: 'starter' });
  assert.equal(f.calls.length, 0); assert.match(page.text(), /Growth plan feature/);
  assert.ok(page.nodes().some(node => node.type === 'Link' && node.props.to === '/merchant/dashboard?tab=billing')); page.unmount();
});
test('Team prevents duplicate submits, shows saved roster truth, and does not claim an invitation', async () => {
  const f = fixture(), pending = deferred();
  f.setBehavior(async (path, init) => init.method === 'POST' ? pending.promise : { staff: [] });
  const page = f.mount('TeamPanel', { plan: 'growth' }); await page.settle();
  page.input('merchant-staff-email').props.onChange({ target: { value: 'staff@example.test' } }); page.render();
  const first = submit(page), second = submit(page); await flush();
  assert.equal(f.calls.filter(call => call.init.method === 'POST').length, 1);
  pending.resolve({ staff_member: staff() }); await Promise.all([first, second]); page.render();
  assert.match(page.text(), /No invitation email or sign-in access was created/);
  page.input('merchant-staff-email').props.onChange({ target: { value: 'STAFF@example.test' } }); page.render(); await submit(page); page.render();
  assert.equal(f.calls.filter(call => call.init.method === 'POST').length, 1); page.unmount();
});
test('Team uncertainty blocks another addition until the saved roster is checked', async () => {
  const f = fixture();
  f.setBehavior(async (path, init) => { if (init.method === 'POST') throw f.error('Unknown result', 0); return { staff: [] }; });
  const page = f.mount('TeamPanel', { plan: 'growth' }); await page.settle();
  page.input('merchant-staff-email').props.onChange({ target: { value: 'staff@example.test' } }); page.render(); await submit(page); page.render();
  assert.equal(page.button('Add staff record').props.disabled, true);
  f.setBehavior(async () => ({ staff: [staff()] })); page.button('Review saved roster').props.onClick(); await page.settle();
  assert.equal(page.button('Add staff record').props.disabled, false); assert.match(page.text(), /Saved staff records loaded/); page.unmount();
});
test('late Team write after leaving the tab cannot change cache or announce success', async () => {
  const f = fixture(), pending = deferred();
  f.setBehavior(async (path, init) => init.method === 'POST' ? pending.promise : { staff: [] });
  const page = f.mount('TeamPanel', { plan: 'growth' }); await page.settle();
  page.input('merchant-staff-email').props.onChange({ target: { value: 'staff@example.test' } }); page.render();
  const result = submit(page); await flush(); const writes = page.instance.writes; page.unmount(); pending.resolve({ staff_member: staff() }); await result;
  assert.equal(page.instance.writes, writes); assert.equal(f.queryClient.getQueryData(['merchant-dashboard', 'session-a', 'team']), undefined);
});


test('definite validation failure can be corrected without creating a new request identity', async () => {
  const f = fixture();
  f.setBehavior(async (path, init) => { if (init.method === 'POST') throw f.error('Validation rejected', 400); throw f.error('Not found', 404); });
  const page = f.mount('OrderComposer', { close() {} }); fillOrder(page);
  await submit(page); await page.settle();
  const first = JSON.parse(f.calls.find(call => call.init.method === 'POST').init.body);
  page.input('manual-customer').props.onChange({ target: { value: 'Corrected Customer' } }); page.render();
  f.setBehavior(async (path, init) => {
    const body = JSON.parse(init.body);
    return { order: record({ customer_name: body.customer_name }), request_id: body.request_id, replayed: false };
  });
  await submit(page); page.render();
  const posts = f.calls.filter(call => call.init.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(JSON.parse(posts[1].init.body).request_id, first.request_id);
  assert.equal(JSON.parse(posts[1].init.body).customer_name, 'Corrected Customer');
  assert.match(page.text(), /saved record is confirmed/); page.unmount();
});
test('mutually exclusive dashboard status counts cannot exceed the owned total', async () => {
  const f = fixture();
  f.setBehavior(async () => ({ ...overview(), stats: { ...overview().stats, active: 3 } }));
  await assert.rejects(f.api().dashboard(signal()), /could not be verified/);
});
