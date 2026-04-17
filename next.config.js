/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  env: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    LINKEDIN_PROXYCURL_KEY: process.env.LINKEDIN_PROXYCURL_KEY,
    SERPAPI_KEY: process.env.SERPAPI_KEY,
    STACKOVERFLOW_KEY: process.env.STACKOVERFLOW_KEY,
    APIFY_TOKEN: process.env.APIFY_TOKEN,
  },
}

module.exports = nextConfig
