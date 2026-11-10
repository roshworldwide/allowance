import type { Metadata, Viewport } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s · ALLOWANCE',
    default: 'ALLOWANCE — give your AI agent an allowance, not your wallet',
  },
  description:
    'A spending firewall for AI agents on PayPal (sandbox): scoped mandates, PayPal step-up approval and one-click undo, proven in an Attack Lab.',
};

export const viewport: Viewport = {
  themeColor: '#0a0f1e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full bg-ink text-text">{children}</body>
    </html>
  );
}
