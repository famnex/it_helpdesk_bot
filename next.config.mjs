/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/helpdesk',
  // Runtime data is kept outside build artifacts and release directories.
  outputFileTracingExcludes: { '*': ['./database.db*', './uploads/**/*', './public/uploads/**/*'] },
  async rewrites() {
    // Authorization must run before Next checks its cached public-file index.
    return { beforeFiles: [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*'
      }
    ] };
  }
};

export default nextConfig;
