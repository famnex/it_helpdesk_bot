/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/helpdesk',
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*'
      }
    ];
  }
};

export default nextConfig;
