// src/lib/scrapers/indeed.ts
// Uses Apify's Indeed scraper actor
// Actor: https://apify.com/misceres/indeed-scraper
// Cost: ~$5 per 1,000 results

import axios from 'axios'
import type { RawCandidate } from '../types'

const APIFY_BASE = 'https://api.apify.com/v2'
const INDEED_ACTOR_ID = 'misceres~indeed-scraper'

interface IndeedJob {
  positionName: string
  company: string
  location: string
  description: string
  url: string
  postedAt: string
  // Indeed doesn't expose candidate profiles directly —
  // we get job postings and infer company talent pools
}

interface ApifyRun {
  id: string
  status: string
  defaultDatasetId: string
}

// Note: Indeed doesn't have a public candidate/resume API.
// The practical approach is:
// 1. Use Apify to scrape job postings (signals where strong engineers work)
// 2. Cross-reference with GitHub/LinkedIn for actual profiles
// OR use Indeed for Employers API (requires employer account)
export async function scrapeIndeed(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN not set')
  }

  const isGlobal = /global|remote|worldwide/i.test(location)
  const searchLocation = isGlobal ? 'United States' : location

  // Start Apify actor run
  const runRes = await axios.post<ApifyRun>(
    `${APIFY_BASE}/acts/${INDEED_ACTOR_ID}/runs?token=${process.env.APIFY_TOKEN}`,
    {
      position: role,
      country: 'US',
      location: searchLocation,
      maxItems: Math.min(limit * 3, 100),
      saveOnlyUniqueItems: true,
    }
  )

  const runId = runRes.data.id

  // Poll for completion (max 60s)
  let status = 'RUNNING'
  let attempts = 0
  while (status === 'RUNNING' && attempts < 12) {
    await new Promise(r => setTimeout(r, 5000))
    const statusRes = await axios.get<{ data: { status: string } }>(
      `${APIFY_BASE}/acts/${INDEED_ACTOR_ID}/runs/${runId}?token=${process.env.APIFY_TOKEN}`
    )
    status = statusRes.data.data.status
    attempts++
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`Apify run ${runId} ended with status: ${status}`)
  }

  // Fetch results
  const datasetRes = await axios.get<{ items: IndeedJob[] }>(
    `${APIFY_BASE}/acts/${INDEED_ACTOR_ID}/runs/${runId}/dataset/items?token=${process.env.APIFY_TOKEN}&limit=${limit}`
  )

  const jobs = datasetRes.data.items || []

  // Convert job postings → candidate signals
  // These represent companies actively hiring this role = talent pool signal
  const candidates: RawCandidate[] = jobs.slice(0, limit).map((job, idx) => {
    const skills = extractSkillsFromDescription(job.description || '')
    return {
      sourceId: 'indeed',
      externalId: `indeed-${idx}-${Date.now()}`,
      name: `${job.company} · ${job.positionName}`,  // job posting as talent signal
      headline: `Active opening: ${job.positionName} at ${job.company}`,
      location: job.location,
      profileUrl: job.url,
      skills,
      rawData: job as unknown as Record<string, unknown>,
    }
  })

  return candidates
}

const TECH_SKILLS = [
  'Python', 'Java', 'Go', 'Golang', 'Rust', 'TypeScript', 'JavaScript',
  'C++', 'Scala', 'Kotlin', 'Swift', 'Ruby', 'PHP', 'R',
  'React', 'Angular', 'Vue', 'Node.js', 'Django', 'FastAPI', 'Spring',
  'Kubernetes', 'Docker', 'Terraform', 'AWS', 'GCP', 'Azure',
  'TensorFlow', 'PyTorch', 'JAX', 'Spark', 'Kafka', 'Flink',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Cassandra',
  'GraphQL', 'gRPC', 'REST', 'microservices', 'CI/CD', 'DevOps',
  'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'RAG', 'MLOps',
]

function extractSkillsFromDescription(description: string): string[] {
  const found: string[] = []
  const lower = description.toLowerCase()
  for (const skill of TECH_SKILLS) {
    if (lower.includes(skill.toLowerCase()) && !found.includes(skill)) {
      found.push(skill)
    }
    if (found.length >= 8) break
  }
  return found
}
