// src/lib/scrapers/google.ts
// Uses SerpAPI to search Google Scholar + regular Google
// Docs: https://serpapi.com/google-scholar-api
// 100 free searches/month, then $50/month for 5,000

import axios from 'axios'
import type { RawCandidate } from '../types'

const SERP_BASE = 'https://serpapi.com/search'

interface ScholarProfile {
  name: string
  link: string
  affiliations: string
  email: string
  cited_by: {
    table: Array<{ citations: { all: number } }>
  }
  interests: Array<{ title: string }>
  thumbnail: string
  author_id: string
}

interface ScholarSearchResult {
  profiles: ScholarProfile[]
}

interface GoogleOrganicResult {
  title: string
  link: string
  snippet: string
  displayed_link: string
}

export async function scrapeGoogle(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY not set')
  }

  const isMLRole = /machine.?learning|ml|ai|nlp|llm|deep.?learning|research|scientist/i.test(role)
  const candidates: RawCandidate[] = []

  // Strategy 1: Google Scholar profiles for research/ML roles
  if (isMLRole) {
    try {
      const scholarRes = await axios.get<ScholarSearchResult>(SERP_BASE, {
        params: {
          engine: 'google_scholar_profiles',
          mauthors: role,
          api_key: process.env.SERPAPI_KEY,
        },
      })

      for (const profile of (scholarRes.data.profiles || []).slice(0, Math.ceil(limit / 2))) {
        const totalCitations = profile.cited_by?.table?.[0]?.citations?.all || 0
        const interests = profile.interests?.map(i => i.title) || []
        const skills = normalizeScholarInterests(interests)

        candidates.push({
          sourceId: 'google',
          externalId: profile.author_id,
          name: profile.name,
          headline: profile.affiliations,
          location: undefined,
          profileUrl: `https://scholar.google.com${profile.link}`,
          avatarUrl: profile.thumbnail,
          skills,
          rawData: {
            ...profile,
            totalCitations,
            interests,
          } as unknown as Record<string, unknown>,
        })
      }
    } catch (err) {
      console.error('Google Scholar error:', err)
    }
  }

  // Strategy 2: Regular Google search for GitHub/LinkedIn profiles
  try {
    const locationFilter = location && !/global|remote/i.test(location)
      ? ` "${location}"`
      : ''

    const queries = [
      `site:github.com "${role}" engineer${locationFilter}`,
      `site:linkedin.com/in "${role}"${locationFilter}`,
    ]

    for (const q of queries) {
      if (candidates.length >= limit) break
      try {
        const res = await axios.get<{ organic_results: GoogleOrganicResult[] }>(SERP_BASE, {
          params: {
            engine: 'google',
            q,
            num: 10,
            api_key: process.env.SERPAPI_KEY,
          },
        })

        for (const result of res.data.organic_results || []) {
          if (candidates.length >= limit) break
          const skills = extractSkillsFromSnippet(result.snippet || '')
          const name = extractNameFromTitle(result.title)
          if (!name) continue

          candidates.push({
            sourceId: 'google',
            externalId: result.link,
            name,
            headline: result.snippet?.slice(0, 120),
            profileUrl: result.link,
            skills,
            rawData: result as unknown as Record<string, unknown>,
          })
        }

        await new Promise(r => setTimeout(r, 500))
      } catch (err) {
        console.error(`Google search error for query "${q}":`, err)
      }
    }
  } catch (err) {
    console.error('Google scrape error:', err)
  }

  return candidates.slice(0, limit)
}

function normalizeScholarInterests(interests: string[]): string[] {
  const map: Record<string, string> = {
    'machine learning': 'Machine Learning',
    'deep learning': 'Deep Learning',
    'natural language processing': 'NLP',
    'computer vision': 'Computer Vision',
    'reinforcement learning': 'RL',
    'neural networks': 'Neural Networks',
    'robotics': 'Robotics',
    'distributed systems': 'Distributed Systems',
    'cryptography': 'Cryptography',
    'algorithms': 'Algorithms',
  }
  const skills: string[] = []
  for (const interest of interests) {
    const lower = interest.toLowerCase()
    for (const [key, val] of Object.entries(map)) {
      if (lower.includes(key) && !skills.includes(val)) skills.push(val)
    }
    if (!skills.includes(interest) && skills.length < 6) skills.push(interest)
  }
  return skills.slice(0, 8)
}

function extractNameFromTitle(title: string): string | null {
  // GitHub: "username (Real Name) · GitHub"
  const ghMatch = title.match(/^([^·(]+)\s*(?:\([^)]+\))?\s*·\s*GitHub/)
  if (ghMatch) return ghMatch[1].trim()

  // LinkedIn: "Real Name - Title | LinkedIn"
  const liMatch = title.match(/^([^-|]+)\s*[-|]/)
  if (liMatch) {
    const name = liMatch[1].trim()
    if (name.split(' ').length >= 2) return name
  }

  return null
}

const TECH_SKILLS_LIST = [
  'Python', 'Go', 'Rust', 'TypeScript', 'JavaScript', 'Java', 'C++',
  'React', 'Kubernetes', 'Docker', 'AWS', 'TensorFlow', 'PyTorch',
  'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'GraphQL',
  'PostgreSQL', 'Redis', 'Kafka', 'Spark', 'Terraform',
]

function extractSkillsFromSnippet(snippet: string): string[] {
  const skills: string[] = []
  const lower = snippet.toLowerCase()
  for (const skill of TECH_SKILLS_LIST) {
    if (lower.includes(skill.toLowerCase())) skills.push(skill)
    if (skills.length >= 6) break
  }
  return skills
}
