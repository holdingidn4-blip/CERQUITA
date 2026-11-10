import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // El paquete compartido se publica como TypeScript sin compilar.
  transpilePackages: ['@cerquita/shared'],
};

export default nextConfig;
