import axios from 'axios'
import type { RawCandidate } from '../types'

const BASE = 'https://api.peopledatalabs.com/v5'

export async function scrapeIndeed(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.PEOPLEDATALABS_KEY) {
    throw new Error('PEOPLEDATALABS_KEY not set')
  }

  const isGlobal = /global|remote|worldwide/i.test(location)

  // Build SQL query for Person Search
  const conditions = [
    `job_title:"${role}"`,
    `job_title_levels:("senior", "manager", "director", "vp", "cto", "principal", "staff", "lead")`,
  ]

  if (!isGlobal) {
    conditions.push(`location_country:"united states"`)
  }

  const sqlQuery = `SELECT * FROM person WHERE ${conditions.join(' AND ')} LIMIT ${Math.min(limit, 100)}`

  try {
    const res = await axios.post(
      `${BASE}/person/search`,
      {
        sql: sqlQuery,
        size: Math.min(limit, 100),
        pretty: false,
      },
      {
        headers: {
          'X-Api-Key': process.env.PEOPLEDATALABS_KEY,
          'Content-Type': 'application/json',
        }
      }
    )

    const people = res.data?.data || []
    const candidates: RawCandidate[] = []

    for (const p of people) {
      const skills = [
        ...(p.skills || []),
        ...(p.experience?.map((e: {title?: string}) => e.title).filter(Boolean) || []),
      ].slice(0, 8)

      const linkedinUrl = p.linkedin_url
        ? `https://linkedin.com/in/${p.linkedin_url}`
        : p.profiles?.find((pr: {network: string, url: string}) => pr.network === 'linkedin')?.url

      candidates.push({
        sourceId: 'linkedin',
        externalId: p.id,
        name: p.full_name,
        headline: p.job_title,
        location: p.location_name,
        profileUrl: linkedinUrl || `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(p.full_name)}`,
        avatarUrl: undefined,
        skills,
        yearsOfExperience: calcYearsFromExperience(p.experience || []),
        rawData: p,
      })
    }

    return candidates
  } catch (err) {
    console.error('PeopleDataLabs error:', err)
    throw err
  }
}

function calcYearsFromExperience(experience: Array<{
  start_date?: string
  end_date?: string
}>): number {
  if (!experience.length) return 0
  const dates = experience
    .map(e => e.start_date)
    .filter(Boolean)
    .map(d => new Date(d!).getFullYear())
  if (!dates.length) return 0
  const earliest = Math.min(...dates)
  return Math.max(0, new Date().getFullYear() - earliest)
}
