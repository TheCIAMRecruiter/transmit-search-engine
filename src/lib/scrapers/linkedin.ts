// src/lib/scrapers/linkedin.ts
// Uses Proxycurl API — legal LinkedIn data for recruiting
// Docs: https://nubela.co/proxycurl/docs
// Cost: ~$0.01 per profile, $0.003 per search result

import axios from 'axios'
import type { RawCandidate } from '../types'

const BASE = 'https://nubela.co/proxycurl/api'

interface ProxycurlSearchResult {
  linkedin_profile_url: string
  profile?: ProxycurlProfile
}

interface ProxycurlProfile {
  public_identifier: string
  full_name: string
  headline: string
  summary: string
  city: string
  state: string
  country: string
  profile_pic_url: string
  experiences: Experience[]
  skills: string[]
  education: Education[]
}

interface Experience {
  title: string
  company: string
  starts_at: { year: number } | null
  ends_at: { year: number } | null
}

interface Education {
  school: string
  degree_name: string
  field_of_study: string
}

function calcYearsOfExperience(experiences: Experience[]): number {
  const now = new Date().getFullYear()
  let earliest = now
  for (const exp of experiences) {
    if (exp.starts_at?.year && exp.starts_at.year < earliest) {
      earliest = exp.starts_at.year
    }
  }
  return Math.max(0, now - earliest)
}

function extractSkillsFromProfile(profile: ProxycurlProfile): string[] {
  const skills = new Set<string>(profile.skills || [])

  // Also extract from experience titles/companies
  const techKeywords = [
    'Python', 'Java', 'Go', 'Rust', 'TypeScript', 'JavaScript', 'C++',
    'React', 'Node.js', 'Kubernetes', 'Docker', 'AWS', 'GCP', 'Azure',
    'TensorFlow', 'PyTorch', 'Spark', 'Kafka', 'PostgreSQL', 'Redis',
    'GraphQL', 'gRPC', 'Terraform', 'ML', 'LLM', 'RAG', 'CUDA',
  ]

  const text = [
    profile.headline,
    profile.summary,
    ...profile.experiences.map(e => e.title),
  ].join(' ')

  for (const kw of techKeywords) {
    if (text.toLowerCase().includes(kw.toLowerCase())) skills.add(kw)
  }

  return Array.from(skills).slice(0, 10)
}

export async function scrapeLinkedIn(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.LINKEDIN_PROXYCURL_KEY) {
    throw new Error('LINKEDIN_PROXYCURL_KEY not set')
  }

  const headers = {
    Authorization: `Bearer ${process.env.LINKEDIN_PROXYCURL_KEY}`,
  }

  // Step 1: Search for profiles matching role + location
  const isGlobal = location.toLowerCase().includes('global') ||
    location.toLowerCase().includes('remote')

  const searchParams = new URLSearchParams({
    keyword_title: role,
    page_size: String(Math.min(limit, 10)), // Proxycurl max 10/page
  })

  if (!isGlobal) {
    searchParams.set('geo_urn', 'urn:li:fs_geo:103644278') // default US; map locations to URNs
  }

  const searchRes = await axios.get<{
    results: ProxycurlSearchResult[]
    next_page?: string
  }>(`${BASE}/v2/search/person?${searchParams}`, { headers })

  const results = searchRes.data.results || []
  const candidates: RawCandidate[] = []

  // Step 2: Enrich each profile
  for (const result of results.slice(0, limit)) {
    try {
      const profileRes = await axios.get<ProxycurlProfile>(
        `${BASE}/v2/linkedin?linkedin_profile_url=${encodeURIComponent(result.linkedin_profile_url)}&use_cache=if-present`,
        { headers }
      )

      const p = profileRes.data
      if (!p.full_name) continue

      candidates.push({
        sourceId: 'linkedin',
        externalId: p.public_identifier,
        name: p.full_name,
        headline: p.headline,
        location: [p.city, p.state, p.country].filter(Boolean).join(', '),
        profileUrl: result.linkedin_profile_url,
        avatarUrl: p.profile_pic_url,
        skills: extractSkillsFromProfile(p),
        yearsOfExperience: calcYearsOfExperience(p.experiences || []),
        rawData: p as unknown as Record<string, unknown>,
      })

      // Proxycurl rate limit: 300 req/min
      await new Promise(r => setTimeout(r, 250))
    } catch {
      // Profile unavailable or rate limited
    }
  }

  return candidates
}
