import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Landing } from './screens/Landing';
import { AddressForm } from './screens/AddressForm';
import { OrderSummary } from './screens/OrderSummary';
import { Payment } from './screens/Payment';
import { Confirmation } from './screens/Confirmation';
import { Tracking } from './screens/Tracking';
import { Chat } from './screens/Chat';
import { OrderHistory } from './screens/OrderHistory';
import { MerchantDashboard } from './screens/MerchantDashboard';
import { MerchantLanding } from './screens/MerchantLanding';
import { PrivacyPolicy } from './screens/PrivacyPolicy';
import { TermsOfService } from './screens/TermsOfService';
import { SupportPage } from './screens/SupportPage';
import { MerchantPricing } from './screens/merchant/MerchantPricing';
import { MerchantSignup } from './screens/merchant/MerchantSignup';
import { MerchantLogin } from './screens/merchant/MerchantLogin';
import { MerchantOrderDetail } from './screens/merchant/MerchantOrderDetail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Protected route — checks for JWT in localStorage
const ProtectedMerchantRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('merchant_token');
  if (!token) {
    return <Navigate to="/merchant/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/shopify">
        <Routes>
          {/* Customer delivery flow */}
          <Route path="/" element={<Landing />} />
          <Route path="/address" element={<AddressForm />} />
          <Route path="/summary" element={<OrderSummary />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/tracking/:orderId" element={<Tracking />} />
          <Route path="/chat/:orderId" element={<Chat />} />
          <Route path="/orders" element={<OrderHistory />} />

          {/* Merchant landing (legacy) */}
          <Route path="/merchant-landing" element={<MerchantLanding />} />

          {/* Merchant platform — public */}
          <Route path="/merchant" element={<MerchantLanding />} />
          <Route path="/merchant/pricing" element={<MerchantPricing />} />
          <Route path="/merchant/signup" element={<MerchantSignup />} />
          <Route path="/merchant/login" element={<MerchantLogin />} />

          {/* Merchant platform — protected */}
          <Route
            path="/merchant/dashboard"
            element={
              <ProtectedMerchantRoute>
                <MerchantDashboard />
              </ProtectedMerchantRoute>
            }
          />
          <Route
            path="/merchant/orders/:id"
            element={
              <ProtectedMerchantRoute>
                <MerchantOrderDetail />
              </ProtectedMerchantRoute>
            }
          />

          {/* Legal */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/support" element={<SupportPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
