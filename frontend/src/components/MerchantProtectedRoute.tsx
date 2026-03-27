import { Navigate } from 'react-router-dom';
import { useMerchantAuth } from '../context/MerchantAuthContext';

export function MerchantProtectedRoute({ children }: { children: React.ReactNode }) {
  const { merchant, loading } = useMerchantAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#09090b',
          color: '#a1a1aa',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!merchant) return <Navigate to="/merchant/login" replace />;

  return <>{children}</>;
}
