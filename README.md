# Transmit Search Engine

Autonomous talent intelligence — searches GitHub, LinkedIn, Stack Overflow, Google Scholar, Hugging Face, and Indeed to find and score the world's top tech candidates.

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/transmit-search-engine
cd transmit-search-engine
npm install
cp .env.local.example .env.local
# Fill in API keys (see below)
npm run dev
```

Open http://localhost:3000

---

## Architecture

```
transmit-search/
├── src/
│   ├── app/
│   │   ├── page.tsx              ← Main UI (React)
│   │   ├── layout.tsx
│   │   └── api/
│   │       └── search/
│   │           └── route.ts      ← SSE streaming API endpoint
│   └── lib/
│       ├── types.ts              ← Shared TypeScript types
│       ├── orchestrator.ts       ← Parallel search coordinator
│       ├── scrapers/
│       │   ├── github.ts         ← GitHub REST API
│       │   ├── linkedin.ts       ← Proxycurl (LinkedIn)
│       │   ├── stackoverflow.ts  ← Stack Exchange API
│       │   ├── google.ts         ← SerpAPI (Scholar + Search)
│       │   ├── huggingface.ts    ← HF Hub API
│       │   └── indeed.ts         ← Apify Indeed actor
│       └── scoring/
│           └── engine.ts         ← 12-factor scoring rubric
```

**How it works:**
1. User submits a search (role + location + topN)
2. API route starts a Server-Sent Events stream
3. Orchestrator runs all scrapers in parallel (concurrency: 3)
4. Each scraped profile is scored immediately via the 12-factor engine
5. Results stream back to the UI in real time
6. Final deduplication + diversity re-ranking produces the top N

---

## API Keys — How to Get Each One

### 1. GitHub Token (Required — Free)
- Go to https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Select scopes: `read:user`, `read:org`
- Copy token → `GITHUB_TOKEN=ghp_...`

**Rate limits:** 5,000 requests/hour authenticated (vs 60 unauthenticated)

---

### 2. Proxycurl — LinkedIn (Required for LinkedIn — Paid)
LinkedIn's official API is restricted to partners. Proxycurl is the industry-standard legal solution for recruiting.

- Sign up at https://nubela.co/proxycurl
- Get API key from dashboard
- Copy → `LINKEDIN_PROXYCURL_KEY=...`

**Cost:** ~$0.01 per profile lookup, ~$0.003 per search result
**Free tier:** 10 free credits to start

---

### 3. SerpAPI — Google (Required for Google/Scholar — Freemium)
- Sign up at https://serpapi.com
- Get API key from dashboard
- Copy → `SERPAPI_KEY=...`

**Cost:** 100 free searches/month, then $50/month for 5,000
**Alternative:** Use Serper.dev (~$50/month for 50k searches — cheaper at scale)

---

### 4. Stack Exchange API (Optional — Free)
Without a key, you get 300 requests/day. With a key, 10,000/day.

- Register an app at https://stackapps.com/apps/oauth/register
- Copy the key → `STACKOVERFLOW_KEY=...`

---

### 5. Apify — Indeed (Required for Indeed — Paid)
- Sign up at https://apify.com
- Get API token from Settings → Integrations
- Copy → `APIFY_TOKEN=apify_api_...`

**Cost:** $5 per 1,000 results
**Free tier:** $5 in free credits monthly

---

### 6. Hugging Face (Optional — Free)
Public API works without a token, but a token unlocks higher rate limits.

- Go to https://huggingface.co/settings/tokens
- Create a "Read" token
- Copy → `HUGGINGFACE_TOKEN=hf_...`

---

## Deployment

### Option A: Vercel (Recommended — easiest)

```bash
npm install -g vercel
vercel login
vercel
```

Then add environment variables in the Vercel dashboard:
- Go to your project → Settings → Environment Variables
- Add each key from `.env.local`

**Important:** Set Function Max Duration to 60s (free) or 300s (Pro) in `vercel.json`:
```json
{
  "functions": {
    "src/app/api/search/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### Option B: GitHub Pages + Cloudflare Workers

GitHub Pages is static-only, so you need Workers for the API:

1. Push the frontend to GitHub Pages:
```bash
npm run build && npm run export
```

2. Deploy the API as a Cloudflare Worker:
```bash
npm install -g wrangler
wrangler deploy
```

Add secrets:
```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put LINKEDIN_PROXYCURL_KEY
# etc.
```

### Option C: Railway (Full Node.js — simplest for backend)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway new
railway up
```

Set environment variables in Railway dashboard.
**Cost:** ~$5/month for hobby plan

---

## Scoring Algorithm

Each candidate is scored 0–100 across 6 dimensions:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| GitHub | 25% | Followers, stars, forks, contribution activity |
| Skills | 20% | Keyword match to search query + breadth |
| Experience | 20% | Years of experience (sweet spot: 7–15y) |
| Open Source | 15% | Forks, accepted SO answers, HF downloads |
| Community | 10% | SO reputation, GitHub followers, citations |
| Recency | 10% | Active commits/contributions in last 12 months |

Adjust weights via environment variables:
```
WEIGHT_GITHUB=25
WEIGHT_SKILLS=20
WEIGHT_EXPERIENCE=20
WEIGHT_OPENSOURCE=15
WEIGHT_COMMUNITY=10
WEIGHT_RECENCY=10
```

**Autonomous re-ranking:** After initial scoring, a second pass ensures source diversity (at least 30% of results from non-GitHub sources), preventing GitHub-heavy skew.

---

## Customization

### Add a new source
1. Create `src/lib/scrapers/yoursource.ts`
2. Export `async function scrapeYourSource(role, location, limit): Promise<RawCandidate[]>`
3. Add the source to `orchestrator.ts` switch statement
4. Add to `allocateLimits()` in `orchestrator.ts`
5. Add to `SOURCES` array in `page.tsx`

### Tune the scoring
Edit `src/lib/scoring/engine.ts` — each factor scorer is a standalone function.

### Export results to CSV
Add this to `page.tsx`:
```typescript
function exportCSV() {
  const rows = candidates.map(c => 
    [c.name, c.score, c.sourceId, c.skills.join(';'), c.profileUrl].join(',')
  )
  const blob = new Blob([['Name,Score,Source,Skills,URL', ...rows].join('\n')])
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'transmit-candidates.csv'
  a.click()
}
```

---

## Cost Estimate (per 100-candidate search)

| Source | Calls | Cost |
|--------|-------|------|
| GitHub | ~200 API calls | Free |
| LinkedIn (Proxycurl) | ~25 profiles | ~$0.25 |
| Stack Overflow | ~50 calls | Free |
| Google/Scholar (SerpAPI) | ~10 searches | ~$0.10 |
| Hugging Face | ~50 calls | Free |
| Indeed (Apify) | ~30 results | ~$0.15 |
| **Total** | | **~$0.50 per search** |

---

## License

MIT — build whatever you want with it.
