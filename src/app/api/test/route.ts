export async function GET() {
  return Response.json({
    GITHUB_TOKEN: process.env.GITHUB_TOKEN ? 'SET ✅' : 'MISSING ❌',
    PEOPLEDATALABS_KEY: process.env.PEOPLEDATALABS_KEY ? 'SET ✅' : 'MISSING ❌',
    STACKOVERFLOW_KEY: process.env.STACKOVERFLOW_KEY ? 'SET ✅' : 'MISSING ❌',
    SERPAPI_KEY: process.env.SERPAPI_KEY ? 'SET ✅' : 'MISSING ❌',
    APIFY_TOKEN: process.env.APIFY_TOKEN ? 'SET ✅' : 'MISSING ❌',
  })
}
