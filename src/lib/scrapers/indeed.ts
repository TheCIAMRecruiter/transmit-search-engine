import axios from 'axios'
import type { RawCandidate } from '../types'

const APIFY_BASE = 'https://api.apify.com/v2'
const INDEED_ACTOR = 'misceres~indeed-scraper'

const TECH_SKILLS = [
  'Python', 'Java', 'Go', 'Golang', 'Rust', 'TypeScript', 'JavaScript',
  'C++', 'Scala', 'Kotlin', 'React', 'Node.js', 'Kubernetes', 'Docker',
  'AWS', 'GCP', 'Azure', 'TensorFlow', 'PyTorch', 'Spark', 'Kafka',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'Terraform',
  'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'MLOps', 'DevOps',
]

function extractSkills(text: string): string[] {
  const found: string[] = []
  const lower = text.toLowerCase()
  for (const skill of TECH_SKILLS) {
    if (lower.includes(skill.toLowerCase())) found.push(skill)
    if (found.length >= 8) break
  }
  return found
}

export async function scrapeIndeed(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN not set')
  }

  const isGlobal = /global|remote|worldwide/i.test(location)

  try {
    // Run actor and wait for results in one call
    const runRes = await axios.post(
      `${APIFY_BASE}/acts/${INDEED_ACTOR}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=60&memory=256`,
      {
        position: role,
        location: isGlobal ? 'United States' : location,
        country: 'US',
        maxItems: Math.min(limit, 20),
        saveOnlyUniqueItems: true,
        followApplyRedirects: false,
      },
      {
        timeout: 65000,
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const jobs = Array.isArray(runRes.data) ? runRes.data : []

    return jobs.slice(0, limit).map((job: Record<string, unknown>, idx: number) => {
      const description = (job.description as string) || (job.snippet as string) || ''
      const company = (job.company as string) || 'Unknown Company'
      const title = (job.positionName as string) || (job.title as string) || role

      return {
        sourceId: 'indeed' as const,
        externalId: (job.id as string) || `indeed-${idx}-${Date.now()}`,
        name: `${company} — ${title}`,
        headline: `Active opening at ${company}`,
        location: (job.location as string) || location,
        profileUrl: (job.url as string) || (job.externalApplyLink as string) || '',
        skills: extractSkills(description),
        yearsOfExperience: undefined,
        rawData: job,
      }
    })
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('Indeed/Apify error:', err.response?.data || err.message)
    }
    throw err
  }
}
