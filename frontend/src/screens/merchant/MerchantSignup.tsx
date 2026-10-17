import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { merchantApi, type Plan, type RegisterBody } from '../../api/merchantApi';
import { useMerchantAuth } from '../../context/merchantAuthState';
import { useMerchantSession } from '../../context/useMerchantSession';
import { confirmedMerchantPlans, confirmedRegistration, confirmedRegistrationInput, merchantPlanPrice } from '../../lib/merchantPageContracts';
import './merchant-pages.css';

const fields = [
  { key:'first_name', label:'First name', autoComplete:'given-name' },
  { key:'last_name', label:'Last name', autoComplete:'family-name' },
  { key:'email', label:'Email', autoComplete:'email', type:'email', required:true },
  { key:'password', label:'Password', autoComplete:'new-password', type:'password', required:true },
  { key:'store_name', label:'Store name', autoComplete:'organization', required:true },
  { key:'city', label:'City', autoComplete:'address-level2' },
  { key:'state', label:'State code', autoComplete:'address-level1' },
] as const;

export function MerchantSignup() {
  const [params] = useSearchParams();
  const session = useMerchantSession();
  const requestedPlan = params.get('plan') || '';
  return <MerchantSignupForm key={`${session.key}:${requestedPlan}`} requestedPlan={requestedPlan} />;
}

function MerchantSignupForm({ requestedPlan }: { requestedPlan:string }) {
  const { merchant, token, error: authError, sessionKey, sessionSignal, isGenerationCurrent, loading: authLoading } = useMerchantAuth();
  const [form, setForm] = useState<RegisterBody>({ first_name:'',last_name:'',email:'',password:'',store_name:'',city:'',state:'',plan:'' });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const retryPlans = () => { setPlansLoading(true); setPlansError(false); setPlans([]); setRetry(value => value + 1); };
  const mounted = useRef(true), busy = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const abort = () => request.current?.abort();
    sessionSignal.addEventListener('abort', abort, { once:true });
    return () => { mounted.current = false; sessionSignal.removeEventListener('abort', abort); abort(); };
  }, [sessionSignal]);
  useEffect(() => {
    const controller = new AbortController();
    merchantApi.plans(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const available = confirmedMerchantPlans(value);
      setPlans(available);
      setForm(current => ({ ...current, plan: available.find(plan => plan.id === requestedPlan)?.id || available[0].id }));
    }).catch(() => { if (!controller.signal.aborted) setPlansError(true); })
      .finally(() => { if (!controller.signal.aborted) setPlansLoading(false); });
    return () => controller.abort();
  }, [requestedPlan, retry]);

  const handleSubmit = async (event:FormEvent) => {
    event.preventDefault();
    if (!mounted.current || busy.current || recovery || merchant || token || authError || authLoading || plansLoading || plansError || !isGenerationCurrent(sessionKey, null)) return;
    let body:RegisterBody;
    try { body = confirmedRegistrationInput(form, plans); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Review your details.'); return; }
    busy.current = true; setLoading(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const value = await merchantApi.register(body, controller.signal);
      if (!mounted.current || controller.signal.aborted || !isGenerationCurrent(sessionKey, null)) return;
      const confirmed = confirmedRegistration(value, body);
      setRecovery(true);
      if (!confirmed.checkoutUrl) {
        setError('Your account was created, but its payment link is unavailable. Sign in to review billing or contact support before trying again.');
        return;
      }
      window.location.assign(confirmed.checkoutUrl);
    } catch {
      if (!mounted.current || controller.signal.aborted || !isGenerationCurrent(sessionKey, null)) return;
      setRecovery(true);
      setError('We could not confirm the account and checkout result. Sign in to check your account or contact support before submitting again.');
    } finally {
      if (mounted.current && !controller.signal.aborted) { busy.current = false; setLoading(false); }
    }
  };

  return <div className="merchant-pages">
    <header><Link to="/" className="merchant-brand">Storree</Link><nav aria-label="Merchant navigation"><Link to="/merchant/pricing">Plans</Link><Link to="/merchant/login">Sign in</Link></nav></header>
    <main><div className="merchant-form">
      <h1>Create your merchant account</h1><p className="merchant-muted">Review a current plan, then continue to hosted checkout. Payment and plan activation must be confirmed before delivery services are enabled.</p>
      {authLoading ? <p role="status">Checking account…</p> : merchant ? <div className="merchant-notice"><p>You are already signed in. Manage your existing account from billing.</p><Link to="/merchant/dashboard?tab=billing">Review billing</Link></div> : token || authError ? <div role="alert" className="merchant-alert"><p>Your existing account session needs verification before you can create an account.</p><div className="merchant-actions"><Link to="/merchant/login">Sign in to verify your account</Link><Link to="/support">Contact support</Link></div></div> : <>
        {error && <div role="alert" className="merchant-alert"><p>{error}</p>{recovery && <div className="merchant-actions"><Link to="/merchant/login">Sign in to check your account</Link><Link to="/support">Contact support</Link></div>}</div>}
        <form onSubmit={handleSubmit} aria-busy={loading}>
          {fields.map(field => <div className="merchant-field" key={field.key}>
            <label htmlFor={`signup-${field.key}`}>{field.label}{'required' in field && field.required ? ' *' : ''}</label>
            <input id={`signup-${field.key}`} name={field.key} type={'type' in field ? field.type : 'text'} autoComplete={field.autoComplete}
              required={'required' in field && field.required} minLength={field.key === 'password' ? 8 : undefined} maxLength={field.key === 'state' ? 2 : undefined}
              value={form[field.key] || ''} disabled={loading || recovery} onChange={event => setForm(current => ({ ...current, [field.key]:event.target.value }))} />
          </div>)}
          <div className="merchant-field"><label htmlFor="signup-plan">Monthly plan *</label>
            {plansLoading && <p role="status">Loading plans...</p>}
            {plansError && <div role="alert"><p>Current plans are unavailable. Please try again.</p><button type="button" onClick={retryPlans}>Retry plans</button></div>}
            <select id="signup-plan" name="plan" value={form.plan} disabled={plansLoading || plansError || loading || recovery} onChange={event => setForm(current => ({ ...current, plan:event.target.value }))} required>
              {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} — {merchantPlanPrice(plan)}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading || recovery || plansLoading || plansError || !form.plan}>{loading ? 'Creating account…' : 'Create account & continue to payment'}</button>
        </form>
        <p className="merchant-muted">By creating an account you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
      </>}
    </div></main>
  </div>;
}
export default MerchantSignup;
