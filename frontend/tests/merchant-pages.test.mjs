import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as contracts from '../src/lib/merchantPageContracts.ts';
import { MerchantRequestError, isMerchantAccessDenied } from '../src/api/merchantSession.ts';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const plan = { id:'access', name:'Access', price_cents:10000, price_display:'$100/month', features:['Order history'] };
const form = { email:'merchant@example.test',password:'fixture-password',first_name:'First',last_name:'Last',store_name:'Fixture store',city:'Dallas',state:'TX',plan:'access' };
const row = (patch={}) => ({ id:'order-a',merchant_id:'merchant-a',source:'standalone',source_order_id:'order-a',status:'pending',service_type:'merchant_record',customer_name:null,customer_phone:null,customer_email:null,delivery_address:null,declared_amount_cents:null,items:[],created_at:'2026-10-17T12:00:00.000Z',updated_at:'2026-10-17T12:00:00.000Z',completed_at:null,payment_status:'unpaid',...patch });
const detail = (patch={}) => ({ order:row(patch),tracking:[] });
const attempt = { id:'attempt-a',attempted_at:'2026-10-17T12:01:00.000Z',success:true,retry_count:0,provider_status_code:200 };
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};

test('install link accepts Shopify identity without guessing a store from an unrelated domain',()=>{
  for(const input of [' your-store ','YOUR-STORE.myshopify.com','https://your-store.myshopify.com/admin?view=store']) assert.equal(contracts.merchantInstallShop(input),'your-store.myshopify.com');
  for(const input of ['', 'your-store.com','https://your-store.example','https://user@your-store.myshopify.com','https://your-store.myshopify.com:8443','-store','store-', 'a'.repeat(64), 'bad/store']) assert.throws(()=>contracts.merchantInstallShop(input));
  const landing=fixture('MerchantLanding.tsx','MerchantLanding');
  assert.ok(landing.links().some(link=>link.props.to==='/merchant/pricing'));assert.ok(landing.links().some(link=>link.props.to==='/merchant/login'));
  const visual=fixture('MerchantLanding.tsx','MerchantHandoffVisual');
  assert.equal(visual.render().type,'figure');assert.equal(visual.render().props['aria-labelledby'],'merchant-handoff-title');
  assert.match(visual.text(),/Store details.*Checkout review.*Pickup handoff.*Order updates/);assert.equal(visual.images().length,0);assert.doesNotMatch(visual.text(),/Quick and Easy|Real-Time|Fast Reliable|payment complete|delivery booked/i);
});

test('plans validate complete server data and display one accurate monthly price',()=>{
  assert.equal(contracts.merchantPlanPrice(contracts.confirmedMerchantPlans({plans:[plan]})[0]),'$100.00/month');
  for(const value of [null,{}, {plans:[]},{plans:[plan,plan]},{plans:[{...plan,id:'unknown'}]},{plans:[{...plan,id:['access']}]},{plans:[{...plan,features:{}}]},{plans:[{...plan,price_cents:NaN}]},{plans:[{...plan,price_cents:1.2}]},{plans:[{...plan,popular:'yes'}]}]) assert.throws(()=>contracts.confirmedMerchantPlans(value));
});
test('signup validates current choice and trims identity without changing the password',()=>{
  assert.deepEqual(contracts.confirmedRegistrationInput({...form,email:' MERCHANT@example.test ',store_name:' Fixture store ',state:' tx '},[plan]),form);
  for(const patch of [{email:'bad'},{password:'short'},{store_name:'  '},{plan:'growth'},{state:'Texas'}]) assert.throws(()=>contracts.confirmedRegistrationInput({...form,...patch},[plan]));
});
test('registration redirect requires the same account and plan plus an approved hosted checkout URL',()=>{
  const result={merchant:{id:'merchant-a',email:form.email,plan:form.plan,plan_status:'pending'},checkout_url:'https://checkout.stripe.com/c/pay/fixture'};
  assert.equal(contracts.confirmedRegistration(result,form).checkoutUrl,result.checkout_url);
  const hostedWithFragment='https://checkout.stripe.com/c/pay/cs_test_fixture#fidkdWxOYHwnPyd1blpxYHZx%2FcXdwYHgl';
  assert.equal(contracts.confirmedRegistration({...result,checkout_url:hostedWithFragment},form).checkoutUrl,hostedWithFragment);
  assert.equal(contracts.confirmedRegistration({...result,checkout_url:null},form).checkoutUrl,null);
  for(const checkout_url of ['https://evil.example/','https://checkout.stripe.com.evil.example/','javascript:alert(1)','https://user@checkout.stripe.com/c/pay/fixture','https://checkout.stripe.com:8443/c/pay/fixture',{}]) assert.throws(()=>contracts.confirmedRegistration({...result,checkout_url},form));
  assert.throws(()=>contracts.confirmedRegistration({...result,merchant:{...result.merchant,email:'other@example.test'}},form));
  assert.throws(()=>contracts.confirmedRegistration({...result,merchant:{...result.merchant,plan:'growth'}},form));
});
test('return paths retain the dashboard view through detail/login without external redirects',()=>{
  const back='/merchant/dashboard?tab=orders&page=3&trackingPage=2&status=pending';
  assert.equal(contracts.merchantDashboardReturn(back),back);
  const path=`/merchant/orders/shopify%3Ajob-a?returnTo=${encodeURIComponent(back)}`;
  assert.equal(contracts.merchantAuthReturn(path),path);
  for(const value of ['https://evil.example','//evil.example','/\\evil.example','/merchant/orders/%2f%2fevil.example','/merchant/orders/%2e%2e','/merchant/orders/%ZZ','/auth','/merchant/dashboard#evil']) assert.equal(contracts.merchantAuthReturn(value),'/merchant/dashboard');
  assert.equal(contracts.merchantDashboardReturn('/merchant/dashboard?tab=bad&page=-1&trackingPage=no&status=bad&token=secret'),'/merchant/dashboard?tab=orders');
});
test('detail accepts missing historical data and only the owned requested record',()=>{
  assert.equal(contracts.confirmedMerchantDetail(detail(),'order-a','merchant-a').order.declared_amount_cents,null);
  assert.equal(contracts.confirmedMerchantDetail({order:row(),tracking:[attempt]},'order-a','merchant-a').tracking[0].success,true);
  for(const patch of [{id:'other'},{merchant_id:'other'},{items:'not-array'},{items:[{name:'Item',quantity:0}]},{declared_amount_cents:-1},{declared_amount_cents:'10'},{created_at:'yesterday'},{customer_name:{}},{source:'other'},{source:['standalone']}]) assert.throws(()=>contracts.confirmedMerchantDetail(detail(patch),'order-a','merchant-a'));
  for(const tracking of [[attempt,attempt],[{...attempt,success:'yes'}],[{...attempt,retry_count:-1}],[{...attempt,provider_status_code:NaN}]]) assert.throws(()=>contracts.confirmedMerchantDetail({order:row(),tracking},'order-a','merchant-a'));
  assert.throws(()=>contracts.confirmedMerchantDetail(row(),'order-a','merchant-a'));
});

function fixture(filename, component, options={}) {
  const source=fs.readFileSync(new URL(`../src/screens/${filename}`,import.meta.url),'utf8')+`\nexport { ${component} };`;
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const cells=[],effects=[],cleanups=[];let cursor=0,dirty=false,tree,queryOptions,refetches=0;
  const navigation=[],redirects=[],apiCalls=[];
  const auth={merchant:null,token:null,error:null,sessionKey:'anonymous:g1',sessionSignal:new AbortController().signal,isGenerationCurrent:()=>current,loading:false,login:async()=>{},...options.auth};
  let current=true;
  const session={key:'merchant-a:g1',owner:'merchant-a',loading:false,current:()=>current,request:async()=>detail()};
  let query={data:detail(),isPending:false,isError:false,isFetching:false,isFetchedAfterMount:true,refetch:async()=>{refetches++},...options.query};
  const api={plans:async()=>({plans:[plan]}),register:async()=>({}),...options.api};
  const react={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;dirty=true}]},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},
    useEffect(effect,deps){const i=cursor++,prev=cells[i];if(!prev||deps.some((v,n)=>v!==prev[n])){cells[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=effect()})}},
  };
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Error,URLSearchParams,AbortController,window:{location:{assign:url=>redirects.push(url)}},require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return require(name);
    if(name==='react-router-dom')return{Link:'Link',Navigate:'Navigate',useLocation:()=>options.location||{pathname:'/merchant/dashboard',search:''},useNavigate:()=>((...args)=>navigation.push(args)),useSearchParams:()=>[new URLSearchParams(options.search||'')],useParams:()=>({id:options.id||'order-a'})};
    if(name.includes('merchantPageContracts'))return contracts;
    if(name.includes('merchantAuthState'))return{useMerchantAuth:()=>auth};
    if(name.includes('useMerchantSession'))return{useMerchantSession:()=>session};
    if(name.includes('merchantSession'))return{MerchantRequestError,isMerchantAccessDenied};
    if(name.includes('merchantApi'))return{merchantApi:new Proxy(api,{get:(target,key)=>(...args)=>{apiCalls.push({key,args});return target[key](...args)}})};
    if(name==='@tanstack/react-query')return{useQuery:value=>{queryOptions=value;return query}};
    if(name.endsWith('.css'))return{};
    if(name.endsWith('.jpg'))return 'fixture-brand-asset.jpg';
    throw new Error(name);
  }});
  const props=options.props||{session,id:options.id||'order-a',backTo:'/merchant/dashboard?tab=orders&page=3'};
  const render=()=>{let safety=0;do{assert.ok(safety++<10);dirty=false;cursor=0;tree=module.exports[component](props);while(effects.length)effects.shift()()}while(dirty);return tree};
  const nodes=x=>Array.isArray(x)?x.flatMap(nodes):!x||typeof x!=='object'?[]:[x,...nodes(x.props?.children)];
  const text=x=>Array.isArray(x)?x.map(text).join(''):x==null||typeof x==='boolean'?'':typeof x!=='object'?String(x):text(x.props?.children);
  const find=predicate=>{const found=nodes(tree).find(predicate);assert.ok(found,'Expected element');return found};
  render();
  return{render,text:()=>text(tree),navigation,redirects,apiCalls,session,queryOptions:()=>queryOptions,
    fill:(id,value)=>{find(n=>n.props?.id===id).props.onChange({target:{value}});render()},
    submit:()=>find(n=>n.type==='form').props.onSubmit({preventDefault(){}}),
    button:label=>find(n=>n.type==='button'&&text(n).trim()===label),
    links:()=>nodes(tree).filter(n=>n.type==='Link'),
    images:()=>nodes(tree).filter(n=>n.type==='img'),
    flush:async()=>{await new Promise(setImmediate);render()},
    setQuery:patch=>{query={...query,...patch};render()},setCurrent:value=>{current=value;render()},
    refetches:()=>refetches,unmount:()=>cleanups.forEach(fn=>fn?.()),
  };
}

test('pricing exposes failure/retry rather than invented plans; an account is routed to billing',async()=>{
  let fail=true;const page=fixture('merchant/MerchantPricing.tsx','MerchantPricing',{auth:{merchant:{id:'merchant-a'}},api:{plans:async()=>{if(fail)throw new Error('offline');return{plans:[plan]}}}});
  await page.flush();assert.match(page.text(),/Current plans are unavailable/);assert.ok(!page.links().some(n=>n.props.to.includes('signup')));
  fail=false;page.button('Retry plans').props.onClick();page.render();await page.flush();
  assert.match(page.text(),/\$100\.00\/month/);assert.doesNotMatch(page.text(),/month\/month/);assert.ok(page.links().some(n=>n.props.to==='/merchant/dashboard?tab=billing'));
});

async function readySignup(api){const page=fixture('merchant/MerchantSignup.tsx','MerchantSignupForm',{props:{requestedPlan:'access'},api});await page.flush();for(const [key,value]of Object.entries(form))if(key!=='plan')page.fill(`signup-${key}`,value);return page}
test('signup blocks duplicate requests and requires account recovery if checkout was not returned',async()=>{
  const pending=deferred();const page=await readySignup({register:()=>pending.promise});
  const first=page.submit();await page.submit();assert.equal(page.apiCalls.filter(c=>c.key==='register').length,1);
  pending.resolve({merchant:{id:'merchant-a',email:form.email,plan:'access',plan_status:'pending'},checkout_url:null});await first;page.render();
  assert.match(page.text(),/account was created/);assert.equal(page.button('Create account & continue to payment').props.disabled,true);
  await page.submit();assert.equal(page.apiCalls.filter(c=>c.key==='register').length,1);assert.equal(page.redirects.length,0);
});
test('late signup confirmation cannot redirect after unmount',async()=>{
  const pending=deferred();const page=await readySignup({register:()=>pending.promise});const first=page.submit();page.unmount();
  pending.resolve({merchant:{id:'merchant-a',email:form.email,plan:'access',plan_status:'pending'},checkout_url:'https://checkout.stripe.com/c/pay/fixture'});await first;
  assert.equal(page.redirects.length,0);assert.equal(page.apiCalls.find(c=>c.key==='register').args[1].aborted,true);
});
test('signup cannot proceed through an unverified stored account or a changed anonymous session',async()=>{
  for(const auth of [{token:'stored-test-token'},{error:'Profile unavailable'}]){
    const page=fixture('merchant/MerchantSignup.tsx','MerchantSignupForm',{props:{requestedPlan:'access'},auth});await page.flush();
    assert.match(page.text(),/existing account session needs verification/);assert.equal(page.apiCalls.filter(c=>c.key==='register').length,0);
  }
  const pending=deferred();const page=await readySignup({register:()=>pending.promise});const result=page.submit();page.setCurrent(false);
  pending.resolve({merchant:{id:'merchant-a',email:form.email,plan:'access',plan_status:'pending'},checkout_url:'https://checkout.stripe.com/c/pay/fixture'});await result;
  assert.equal(page.redirects.length,0);
});
test('login duplicate/late callbacks are blocked and a failure preserves retry',async()=>{
  const pending=deferred();let calls=0;const page=fixture('merchant/MerchantLogin.tsx','MerchantLogin',{auth:{login:()=>{calls++;return pending.promise}}});
  page.fill('merchant-email',form.email);page.fill('merchant-password',form.password);
  const first=page.submit();await page.submit();assert.equal(calls,1);pending.reject(new Error('Sign in failed'));await first;page.render();assert.match(page.text(),/Sign in failed/);assert.equal(page.button('Sign in').props.disabled,false);
  const late=deferred();const other=fixture('merchant/MerchantLogin.tsx','MerchantLogin',{auth:{login:()=>late.promise}});other.fill('merchant-email',form.email);other.fill('merchant-password',form.password);const result=other.submit();other.unmount();late.resolve();await result;assert.equal(other.navigation.length,0);
});
test('detail uses session/record cache, query cancellation, safe back context and real nullable values',async()=>{
  const page=fixture('merchant/MerchantOrderDetail.tsx','MerchantOrderDetailSession');
  assert.deepEqual(Array.from(page.queryOptions().queryKey),['merchant-order-detail','merchant-a:g1','order-a']);assert.equal(page.queryOptions().retry,false);assert.equal(page.queryOptions().refetchOnMount,'always');
  let received;page.session.request=async(path,init)=>{received={path,init};return detail()};const controller=new AbortController();await page.queryOptions().queryFn({signal:controller.signal});assert.equal(received.init.signal,controller.signal);assert.equal(received.path,'/api/merchant/orders/order-a');
  assert.ok(page.links().some(n=>n.props.to==='/merchant/dashboard?tab=orders&page=3'));assert.match(page.text(),/Declared order valueNot recorded/);assert.doesNotMatch(page.text(),/\$0\.00|Delivered/);
  assert.match(page.text(),/manual record does not book a delivery or charge/);assert.match(page.text(),/12:00 PM UTC/);
  page.setQuery({data:{order:row({service_type:'item_delivery',completed_at:'2026-10-17T14:00:00.000Z'}),tracking:[attempt,{...attempt,id:'attempt-b',success:false,retry_count:2,provider_status_code:503}]}});
  assert.match(page.text(),/Delivery requests/);assert.match(page.text(),/Request accepted/);assert.match(page.text(),/Request not accepted/);assert.match(page.text(),/accepted request does not confirm that the order was delivered/);
  assert.match(page.text(),/12:01 PM UTC/);assert.match(page.text(),/2:00 PM UTC/);assert.doesNotMatch(page.text(),/Provider response|Retry count|Dispatch attempt|\b200\b|\b503\b/);
  page.setQuery({isFetchedAfterMount:false,isFetching:true});assert.doesNotMatch(page.text(),/order-a|Not recorded/);
});
test('detail errors and revoked sessions hide prior customer data and old refresh callbacks',()=>{
  const page=fixture('merchant/MerchantOrderDetail.tsx','MerchantOrderDetailSession',{query:{data:detail({customer_name:'Private customer'})}});const refresh=page.button('Refresh order').props.onClick;
  page.setQuery({isError:true,error:new MerchantRequestError('Denied',403)});assert.match(page.text(),/access needs verification/);assert.doesNotMatch(page.text(),/Private customer/);
  page.setQuery({isError:true,error:new MerchantRequestError('Missing',404)});assert.match(page.text(),/Order not found/);assert.doesNotMatch(page.text(),/Private customer/);
  page.setQuery({isError:false,error:undefined});page.setCurrent(false);refresh();assert.equal(page.refetches(),0);assert.equal(page.queryOptions().enabled,false);
  page.setCurrent(true);page.unmount();refresh();assert.equal(page.refetches(),0);
});
test('protected-route guest redirect and failed-profile sign-in retain the order and dashboard context',()=>{
  const back='/merchant/dashboard?tab=orders&page=4&status=assigned&trackingPage=2';
  const location={pathname:'/merchant/orders/shopify%3Ajob-a',search:`?returnTo=${encodeURIComponent(back)}`};
  const expected=`/merchant/login?returnTo=${encodeURIComponent(location.pathname+location.search)}`;
  const guest=fixture('../components/MerchantProtectedRoute.tsx','MerchantProtectedRoute',{location});
  assert.equal(guest.render().props.to,expected);assert.equal(guest.render().props.replace,true);
  const failed=fixture('../components/MerchantProtectedRoute.tsx','MerchantProtectedRoute',{location,auth:{error:'Profile unavailable'}});
  assert.ok(failed.links().some(link=>link.props.to===expected));
});
