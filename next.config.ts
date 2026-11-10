import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Content Security Policy. `img-src 'self' data: blob:` follows AG Studio's security note: no remote
// images, so AI-written markdown in the Studio chat can't exfiltrate data through image URLs.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  'frame-src https://www.youtube-nocookie.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // PayPal approval pages are reached by redirect after our own form posts.
  "form-action 'self' https://www.sandbox.paypal.com https://sandbox.paypal.com",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native / heavy server-only packages stay out of the bundle.
  serverExternalPackages: ['better-sqlite3', '@paypal/agent-toolkit'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
