import { NextResponse } from 'next/server';
import { SITE } from '@/lib/site';

export async function GET() {
  const robotsTxt = `# ${SITE.name} — robots.txt
# ${SITE.url}

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
Disallow: /*/audit
Disallow: /*/playground
Disallow: /*/agents
Disallow: /*/onboarding
Disallow: /*/organizations
Disallow: /*/platform

User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`;

  return new NextResponse(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
