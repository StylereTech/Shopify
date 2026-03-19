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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/address" element={<AddressForm />} />
          <Route path="/summary" element={<OrderSummary />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/tracking/:orderId" element={<Tracking />} />
          <Route path="/chat/:orderId" element={<Chat />} />
          <Route path="/orders" element={<OrderHistory />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
