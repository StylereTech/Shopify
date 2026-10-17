import { Link, Navigate, useLocation } from 'react-router-dom';
import { useMerchantAuth } from '../context/merchantAuthState';

export function MerchantProtectedRoute({ children }: { children: React.ReactNode }) {
  const { merchant, loading, error, retry } = useMerchantAuth();
  const location = useLocation();
  const signInPath = `/merchant/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
  if (loading || error) return <main style={{ minHeight: '100vh', padding: 'clamp(24px, 8vw, 80px)', background: '#f8f7f4', color: '#18212b', fontFamily: 'system-ui, sans-serif' }}>
    <h1>{loading ? 'Checking your merchant account…' : 'Your merchant account could not be checked'}</h1>
    {loading ? <p role="status">Please wait while we verify this session.</p> : <>
      <p role="alert">{error}</p>
      <button type="button" onClick={() => void retry()} style={{ minHeight: 44, padding: '10px 20px', marginRight: 16 }}>Retry account check</button>
      <Link to={signInPath}>Sign in</Link>
    </>}
  </main>;
  if (!merchant) return <Navigate to={signInPath} replace />;
  return <>{children}</>;
}
