'use client';
import { useEffect, useRef } from 'react';

// The existing CRM view controllers are retained as a compatibility layer while
// Next owns routing, rendering, assets and the entire server runtime.
const scripts = [
  'api','db','sync','auth','components/toast','components/modal','components/navbar','components/sidebar',
  'views/dashboard','views/leads','views/customer_profile','views/callbacks','views/lead_transfer',
  'views/reports','views/teams','views/users','views/audit','views/import_export','views/contracts',
  'views/finance','views/employee_finance','app'
];
let boot: Promise<void> | undefined;
function loadCRM() {
  return boot ??= (async () => {
    // Retire the Flask service worker, which can otherwise cache old HTML/API responses.
    if ('serviceWorker' in navigator) {
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        if (registration.active?.scriptURL.startsWith(`${location.origin}/sw.js`)) await registration.unregister();
      }
    }
    for (const name of scripts) await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = `/js/${name}.js`;
      script.onload = () => resolve(); script.onerror = () => reject(new Error(`Unable to load ${name}`));
      document.body.appendChild(script);
    });
    const app = (window as unknown as { App: { init(): Promise<void> } }).App;
    await app.init();
  })();
}
export default function CRM() {
  const error = useRef<HTMLParagraphElement>(null);
  useEffect(() => { loadCRM().catch(e => { if (error.current) error.current.textContent = e.message; }); }, []);
  return <><div id="app-root"><div style={{padding:48,textAlign:'center'}}>Loading CallPro CRM…</div></div><p ref={error} role="alert" /></>;
}
