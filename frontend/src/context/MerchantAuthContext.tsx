import { useState, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { MerchantAuthContext } from './merchantAuthState';
import { createMerchantAuthController } from './merchantAuthController';

export function MerchantAuthProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createMerchantAuthController({ storage: {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  }, events: window }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => controller.mount(), [controller]);
  return <MerchantAuthContext.Provider value={{ ...snapshot, login: controller.login, logout: controller.logout, retry: controller.retry, isCurrent: controller.isCurrent, isGenerationCurrent: controller.isGenerationCurrent }}>{children}</MerchantAuthContext.Provider>;
}
