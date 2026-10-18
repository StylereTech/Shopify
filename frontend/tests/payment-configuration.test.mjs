import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../package.json',import.meta.url)),ts=require('typescript');
const source=readFileSync(new URL('../src/api/paymentConfiguration.ts',import.meta.url),'utf8').replaceAll('import.meta.env.VITE_STRIPE_PK',"''");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class CustomerRequestError extends Error{constructor(message,status=0,code=''){super(message);this.status=status;this.code=code;}}
const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports,AbortController,setTimeout,clearTimeout,require(name){if(name==='./customerSession')return{CustomerRequestError};if(name==='@stripe/stripe-js')return{loadStripe:()=>{throw Error('unexpected SDK');}};throw Error(name);}});
const {loadPaymentConfiguration}=module.exports;
const response=(value,status=200,type='application/json')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':type}});
const config={schemaVersion:1,stripePublishableKey:'pk_test_fixture'};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const fixture=(patch={})=>{const calls=[],sdk=[];const stripe={synthetic:true};return{calls,sdk,stripe,options:{compiledKey:'',fetcher:async(path,init)=>{calls.push({path,init});return response(config);},stripeLoader:async key=>{sdk.push(key);return stripe;},timeoutMs:100,...patch}};};
test('embedded configuration uses a fixed same-origin public destination without credentials',async()=>{
  const f=fixture();assert.equal(await loadPaymentConfiguration(new AbortController().signal,f.options),f.stripe);assert.equal(f.calls[0].path,'/shopify/runtime-config.json');assert.equal(f.calls[0].init.credentials,'omit');assert.equal(f.calls[0].init.redirect,'error');assert.equal(f.calls[0].init.cache,'no-store');assert.deepEqual(f.sdk,['pk_test_fixture']);
});
test('standalone explicitly configured builds retain their public key without a configuration fetch',async()=>{
  const f=fixture({compiledKey:'pk_live_fixture'});await loadPaymentConfiguration(new AbortController().signal,f.options);assert.equal(f.calls.length,0);assert.deepEqual(f.sdk,['pk_live_fixture']);
});
test('missing, malformed and error-shaped public keys never load Stripe',async()=>{
  for(const value of [null,[],{}, {schemaVersion:2,stripePublishableKey:'pk_test_fixture'},{...config,stripePublishableKey:null},{...config,stripePublishableKey:'sk_test_private'},{...config,stripePublishableKey:'https://other.test'},{...config,error:'failed'}]){const f=fixture({fetcher:async()=>response(value)});await assert.rejects(loadPaymentConfiguration(new AbortController().signal,f.options),error=>error.code==='PAYMENT_CONFIGURATION_UNAVAILABLE');assert.equal(f.sdk.length,0);}
});
test('failed HTTP, HTML and invalid JSON responses stay unavailable',async()=>{
  for(const fetcher of [async()=>response(config,503),async()=>response(config,200,'text/html'),async()=>new Response('{bad',{headers:{'Content-Type':'application/json'}}),async()=>{throw TypeError('offline private details');}]){const f=fixture({fetcher});await assert.rejects(loadPaymentConfiguration(new AbortController().signal,f.options),error=>!error.message.includes('private')&&error.code==='PAYMENT_CONFIGURATION_UNAVAILABLE');assert.equal(f.sdk.length,0);}
});
test('already cancelled configuration performs neither fetch nor SDK loading',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();await assert.rejects(loadPaymentConfiguration(controller.signal,f.options));assert.equal(f.calls.length,0);assert.equal(f.sdk.length,0);
});
for(const stage of ['fetch','body','sdk'])test(`${stage} deadline bounds a dependency that ignores abort`,async()=>{
  const gate=deferred();const f=fixture({timeoutMs:15,...(stage==='fetch'?{fetcher:()=>gate.promise}:stage==='body'?{fetcher:async()=>({ok:true,headers:new Headers({'Content-Type':'application/json'}),json:()=>gate.promise})}:{stripeLoader:()=>gate.promise})});
  await assert.rejects(loadPaymentConfiguration(new AbortController().signal,f.options),error=>error.code==='PAYMENT_CONFIGURATION_UNAVAILABLE');gate.resolve(stage==='fetch'?response(config):stage==='body'?config:f.stripe);
});
test('leaving during public configuration suppresses late SDK loading',async()=>{
  const gate=deferred(),f=fixture({fetcher:()=>gate.promise}),controller=new AbortController();const task=loadPaymentConfiguration(controller.signal,f.options);controller.abort();await assert.rejects(task);gate.resolve(response(config));await new Promise(setImmediate);assert.equal(f.sdk.length,0);
});
test('null and rejected SDK results do not enable a payment form',async()=>{
  for(const stripeLoader of [async()=>null,async()=>{throw Error('unavailable');}]){const f=fixture({stripeLoader});await assert.rejects(loadPaymentConfiguration(new AbortController().signal,f.options));}
});
