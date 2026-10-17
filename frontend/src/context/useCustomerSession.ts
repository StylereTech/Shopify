import { useEffect, useSyncExternalStore } from 'react';
import { createCustomerSessionController } from './customerSessionController';
import { useOrderStore } from '../store/orderStore';

const controller = createCustomerSessionController({
  bindGuest: id => useOrderStore.getState().bindGuest(id),
  storage: { setItem: (key, value) => globalThis.localStorage.setItem(key, value) },
  events: typeof window === 'undefined' ? undefined : window,
});
export function useCustomerSession() {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.start(); }, []);
  return { ...snapshot, ...controller.capture(), retry: controller.retry, end: controller.end };
}
