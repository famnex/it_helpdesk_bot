export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { migrateLegacyUploads } = await import('./lib/uploads');
    migrateLegacyUploads();
  }
}
