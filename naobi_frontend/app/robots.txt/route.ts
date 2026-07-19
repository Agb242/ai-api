import { NextResponse } from 'next/server';

export async function GET() {
  const robotsTxt = `# noabi — robots.txt

User-agent: *
Allow: /
Disallow: /api/
Disallow: /_next/
Disallow: /*/dashboard
Disallow: /*/keys
Disallow: /*/wallet
Disallow: /*/filters
Disallow: /*/members
Disallow: /*/logs
Disallow: /*/onboarding
Disallow: /*/organizations

Sitemap: /sitemap.xml
`;

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
