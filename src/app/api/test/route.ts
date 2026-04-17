export async function GET() {
  return Response.json({
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET ✅' : 'MISSING ❌',
    LINKEDIN_PROXYCURL_KEY: process.env.LINKEDIN_PROXYCURL_KEY ? 'SET ✅' : 'MISSING ❌',
    STACKOVERFLOW_KEY: process.env.STACKOVERFLOW_KEY ? 'SET ✅' : 'MISSING ❌',
    SERPAPI_KEY: process.env.SERPAPI_KEY ? 'SET ✅' : 'MISSING ❌',
    APIFY_TOKEN: process.env.APIFY_TOKEN ? 'SET ✅' : 'MISSING ❌',
  })
}
