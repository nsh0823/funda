import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';

import { worker } from '@/mocks/browser';

import App from './app';

import '@/styles/main.css';

// const loadBoostadSdk = () => {
//   // 개발 환경에서는 광고 SDK를 로딩하지 않는다
//   if (import.meta.env.DEV) {
//     return;
//   }

//   const existingScript = document.querySelector(
//     'script[data-boostad-sdk="true"]',
//   ) as HTMLScriptElement | null;
//   if (existingScript) {
//     return;
//   }

//   const script = document.createElement('script');
//   script.src = 'https://kr.object.ncloudstorage.com/boostad-sdk-dev/sdk/sdk.js';
//   script.async = true;
//   script.dataset.boostadSdk = 'true';
//   script.dataset.blogKey = '42e12acd-506f-455d-9831-864e3d9ccb3e';
//   script.dataset.context = '실시간 협업';
//   script.dataset.auto = 'false';

//   document.head.appendChild(script);
// };

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ['localhost', /^https:\/\/funda\.website\/api/],
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});
const startApp = async () => {
  // loadBoostadSdk();

  if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_ENABLE_MSW === 'true') {
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  createRoot(document.getElementById('root')!).render(<App />);
};
startApp();
