import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Panel interno y 100 % dinámico (sesión en cookies): sin Cache Components.
  transpilePackages: ['@cerquita/shared'],
};

export default nextConfig;
