import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'CallPro CRM — Customer & Follow-up Management',
  description: 'Customer records, team assignments, callbacks and business administration.',
  manifest: '/manifest.json'
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head>
    {['main','layout','components','dashboard','friendly'].map(name => <link key={name} rel="stylesheet" href={`/css/${name}.css`} />)}
  </head><body>{children}</body></html>;
}
