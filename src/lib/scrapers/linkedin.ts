import axios from 'axios'
import type { RawCandidate } from '../types'

export async function scrapeLinkedIn(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.PEOPLEDATALABS_KEY) {
    throw new Error('PEOPLEDATALABS_KEY not set')
  }

  const isGlobal = /global|remote|worldwide/i.test(location)

  const res = await axios.get(
    'https://api.peopledatalabs.com/v5/person/search',
    {
      headers: {
        'X-Api-Key': process.env.PEOPLEDATALABS_KEY,
      },
      params: {
        query: JSON.stringify({
          bool: {
            must: [
              { match: { job_title: role } },
              ...(!isGlobal ? [{ match: { location_country: 'united states' } }] : []),
            ]
          }
        }),
        size: Math.min(limit, 100),
        pretty: false,
      }
    }
  )

  const people = res.data?.data || []

  return people.map((p: Record<string, unknown>) => {
    const experience = (p.experience as Array<{start_date?: string}>) || []
    const skills = (p.skills as string[]) || []

    const linkedinUrl = p.linkedin_url
  ? `https://${p.linkedin_url.replace(/^https?:\/\//, '')}`
      : `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(p.full_name as string)}`

    return {
      sourceId: 'linkedin' as const,
      externalId: p.id as string,
      name: p.full_name as string,
      headline: p.job_title as string,
      location: p.location_name as string,
      profileUrl: linkedinUrl,
      avatarUrl: undefined,
      skills: skills.slice(0, 8),
      yearsOfExperience: calcYears(experience),
      rawData: p,
    }
  })
}

function calcYears(experience: Array<{start_date?: string}>): number {
  if (!experience.length) return 0
  const years = experience
    .map(e => e.start_date ? new Date(e.start_date).getFullYear() : null)
    .filter(Boolean) as number[]
  if (!years.length) return 0
  return Math.max(0, new Date().getFullYear() - Math.min(...years))
}
