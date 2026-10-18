import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { merchantApi, type Plan } from '../../api/merchantApi';
import { useMerchantAuth } from '../../context/merchantAuthState';
import { confirmedMerchantPlans, merchantPlanPrice } from '../../lib/merchantPageContracts';
import './merchant-pages.css';

export function MerchantPricing() {
  const { merchant, loading: authLoading } = useMerchantAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retryPlans = () => { setLoading(true); setError(false); setPlans([]); setAttempt(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    merchantApi.plans(controller.signal).then(value => {
      if (!controller.signal.aborted) setPlans(confirmedMerchantPlans(value));
    }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="merchant-pages">
    <header><Link className="merchant-brand" to="/">Style.re</Link><nav aria-label="Merchant navigation"><Link to={merchant ? '/merchant/dashboard' : '/merchant/login'}>{merchant ? 'Dashboard' : 'Sign in'}</Link></nav></header>
    <main>
      <div className="merchant-intro"><h1>Merchant plans</h1><p className="merchant-muted">Review the current monthly plans. Account activation and delivery availability are confirmed separately.</p></div>
      {loading ? <p role="status">Loading plans...</p> : error ? <div role="alert" className="merchant-alert"><p>Current plans are unavailable. Please try again.</p><button type="button" onClick={retryPlans}>Retry plans</button></div> : <div className="merchant-grid">
        {plans.map(plan => <article className="merchant-card merchant-plan" key={plan.id}>
          <h2>{plan.name}</h2><p className="merchant-price">{merchantPlanPrice(plan)}</p>
          <ul>{plan.features.map((feature,index) => <li key={`${index}:${feature}`}>{feature}</li>)}</ul>
          {authLoading ? <p role="status">Checking account…</p> : <Link className="merchant-button" to={merchant ? '/merchant/dashboard?tab=billing' : `/merchant/signup?plan=${encodeURIComponent(plan.id)}`}>{merchant ? 'Review billing' : 'Get started'}</Link>}
        </article>)}
      </div>}
    </main>
  </div>;
}
export default MerchantPricing;
