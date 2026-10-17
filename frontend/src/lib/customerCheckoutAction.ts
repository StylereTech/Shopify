import { CustomerRequestError, type CustomerSession } from '../api/customerSession';
import { customerApi } from '../api/client';
import { useOrderStore } from '../store/orderStore';

// A write may have reached the server even when its response was lost. Reuse
// the persisted key and frozen payload; never replace them after a timeout.
export async function executeCheckoutRequest({ session, mode, signal, current, store = useOrderStore, api = customerApi(session) }: {
  session: CustomerSession;
  mode: 'save' | 'recover' | 'resubmit';
  signal: AbortSignal;
  current: () => boolean;
  store?: typeof useOrderStore;
  api?: ReturnType<typeof customerApi>;
}) {
  if (!current()) return null;
  const state = store.getState();
  if (mode !== 'save' && !state.checkoutRequest) throw new CustomerRequestError('There is no saved request to recover.', 409);
  const request = state.prepareCheckout();
  const matches = () => current() && store.getState().revision === request.revision && store.getState().checkoutRequest?.requestId === request.requestId;
  if (!matches()) return null;
  store.getState().markCheckoutUncertain(request.requestId);
  try {
    const order = mode === 'recover' ? await api.recoverOrder(request.requestId, signal) : await api.createOrder(request.payload, request.requestId, signal);
    if (!matches()) return null;
    if (!store.getState().acceptCheckout(order, request.requestId, request.revision)) return null;
    return order;
  } catch (error) {
    if (!matches()) return null;
    if (error instanceof CustomerRequestError && ((mode !== 'recover' && [400, 422].includes(error.status)) || (error.status === 410 && error.code === 'ORDER_RETIRED'))) store.getState().rejectCheckout(request.requestId, request.revision);
    throw error;
  }
}
