import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { App } from '@/app/App';
import '@/shared/styles/global.css';

let hasReloadedForServiceWorkerUpdate = false;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForServiceWorkerUpdate) {
      return;
    }

    hasReloadedForServiceWorkerUpdate = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(false);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return;
      }

      const checkForUpdates = () => {
        if (!document.hidden) {
          void registration.update();
        }
      };

      window.addEventListener('focus', checkForUpdates);
      document.addEventListener('visibilitychange', checkForUpdates);
    },
    onRegisterError(error) {
      if (import.meta.env.DEV) {
        console.error('Service worker registration failed', error);
      }
    }
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
