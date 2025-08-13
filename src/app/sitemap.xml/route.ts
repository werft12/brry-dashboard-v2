import { NextResponse } from 'next/server';

// Configure for static export
export const dynamic = 'force-static';
export const revalidate = false;

// Return empty sitemap to discourage crawling
export async function GET() {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Private application - no public URLs -->
</urlset>`;

  return new NextResponse(sitemap, {
    headers: {
      'Content-Type': 'application/xml',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
