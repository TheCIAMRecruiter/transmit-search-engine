// src/lib/scrapers/linkedin.ts
// Uses Proxycurl API — legal LinkedIn data for recruiting
// Docs: https://nubela.co/proxycurl/docs
// Cost: ~$0.01 per profile, $0.003 per search result

import axios from 'axios'
import type { RawCandidate } from '../types'

const BASE = 'https://nubela.co/api/v1'

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

  const candidates: RawCandidate[] = []

  // Search by role/title using employee profile endpoint
  const companies = ['Google', 'Meta', 'Apple', 'Microsoft', 'Amazon', 'OpenAI', 'Anthropic', 'Stripe', 'Airbnb', 'Uber']

  for (const company of companies.slice(0, Math.ceil(limit / 2))) {
    if (candidates.length >= limit) break
    try {
      const res = await axios.get(
        `${BASE}/employee/profile`,
        {
          headers,
          params: {
            title: role,
            company: company,
          }
        }
      )

      const p = res.data
      if (!p || !p.full_name) continue

      candidates.push({
        sourceId: 'linkedin',
        externalId: p.public_identifier || `${company}-${candidates.length}`,
        name: p.full_name,
        headline: p.headline,
        location: p.location,
        profileUrl: p.linkedin_profile_url || `https://linkedin.com/in/${p.public_identifier}`,
        avatarUrl: p.profile_pic_url,
        skills: p.skills || [],
        yearsOfExperience: calcYearsOfExperience(p.experiences || []),
        rawData: p,
      })

      await new Promise(r => setTimeout(r, 300))
    } catch {
      // skip
    }
  }

  return candidates
}
