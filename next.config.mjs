/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'${process.env.NODE_ENV === 'development' ? ' ws: wss:' : ''}; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` },
      ],
    }];
  },
};

export default nextConfig;
