import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMerchantAuth } from '../../context/merchantAuthState';
import { merchantAuthReturn } from '../../lib/merchantPageContracts';
import './merchant-pages.css';

export function MerchantLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, loading:authLoading } = useMerchantAuth();
  const [email,setEmail] = useState(''), [password,setPassword] = useState('');
  const [loading,setLoading] = useState(false), [error,setError] = useState<string | null>(null);
  const mounted = useRef(true), busy = useRef(false), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const handleSubmit = async (event:FormEvent) => {
    event.preventDefault();
    if (!mounted.current || busy.current || authLoading) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !password) { setError('Enter your email address and password.'); return; }
    busy.current = true; setLoading(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      await login(address,password,controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      navigate(merchantAuthReturn(params.get('returnTo')), { replace:true });
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Sign in could not be confirmed. Try again.');
    } finally {
      if (mounted.current && !controller.signal.aborted) { busy.current = false; setLoading(false); }
    }
  };
  return <div className="merchant-pages">
    <header><Link className="merchant-brand" to="/">Storree</Link><nav aria-label="Merchant navigation"><Link to="/merchant/pricing">See plans</Link></nav></header>
    <main><div className="merchant-form"><h1>Merchant sign in</h1><p className="merchant-muted">Use your merchant account to review store orders and billing.</p>
      {error && <div className="merchant-alert" role="alert">{error}</div>}
      {authLoading && <p role="status">Checking your account…</p>}
      <form onSubmit={handleSubmit} aria-busy={loading}>
        <div className="merchant-field"><label htmlFor="merchant-email">Email</label><input id="merchant-email" name="email" type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} disabled={loading} required /></div>
        <div className="merchant-field"><label htmlFor="merchant-password">Password</label><input id="merchant-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} disabled={loading} required /></div>
        <button type="submit" disabled={loading || authLoading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="merchant-actions"><Link to="/merchant/pricing">Create a merchant account</Link><Link to="/support">Need help signing in?</Link></div>
    </div></main>
  </div>;
}
export default MerchantLogin;
