import axios from 'axios'
import type { RawCandidate } from '../types'

const BASE = 'https://nubela.co/proxycurl/api/v2'

const headers = () => ({
  Authorization: `Bearer ${process.env.LINKEDIN_PROXYCURL_KEY}`,
})

function calcYearsOfExperience(experiences: Array<{starts_at?: {year: number} | null}>): number {
  const now = new Date().getFullYear()
  let earliest = now
  for (const exp of experiences) {
    if (exp.starts_at?.year && exp.starts_at.year < earliest) {
      earliest = exp.starts_at.year
    }
  }
  return Math.max(0, now - earliest)
}

export async function scrapeLinkedIn(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.LINKEDIN_PROXYCURL_KEY) {
    throw new Error('LINKEDIN_PROXYCURL_KEY not set')
  }

  const candidates: RawCandidate[] = []
  const seen = new Set<string>()

  try {
    // Use Person Search endpoint
    const searchRes = await axios.get(
  `${BASE}/search/person`,
  {
    headers: headers(),
    params: {
      keywords: role,
      location: location.toLowerCase().includes('global') ? 'Worldwide' : location,
      page_size: Math.min(limit, 10),
    }
  }
)

    const results = searchRes.data?.results || searchRes.data?.items || searchRes.data || []

    for (const result of results) {
      if (candidates.length >= limit) break

      const profileUrl = result.linkedin_profile_url || result.profile_url || result.url
      if (!profileUrl || seen.has(profileUrl)) continue
      seen.add(profileUrl)

      try {
        // Enrich with full profile
        const profileRes = await axios.get(
          `${BASE}/person/profile`,
          {
            headers: headers(),
            params: { linkedin_profile_url: profileUrl }
          }
        )

        const p = profileRes.data
        if (!p?.full_name) continue

        candidates.push({
          sourceId: 'linkedin',
          externalId: p.public_identifier || profileUrl,
          name: p.full_name,
          headline: p.headline,
          location: p.location,
          profileUrl,
          avatarUrl: p.profile_pic_url,
          skills: p.skills || [],
          yearsOfExperience: calcYearsOfExperience(p.experiences || []),
          rawData: p,
        })

        await new Promise(r => setTimeout(r, 300))
      } catch {
        // skip failed profile enrichments
      }
    }
  } catch (err) {
    // Fallback to Employee Search if Person Search fails
    console.error('Person search failed, trying employee search:', err)

    try {
      const companies = ['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'OpenAI', 'Anthropic', 'Stripe', 'Uber', 'Airbnb']

      for (const company of companies) {
        if (candidates.length >= limit) break

        const empRes = await axios.get(
          `${BASE}/company/employee/search`,
          {
            headers: headers(),
            params: {
              company_name: company,
              keyword: role,
              limit: 3,
            }
          }
        )

        const employees = empRes.data?.employees || empRes.data?.results || []

        for (const emp of employees) {
          if (candidates.length >= limit) break
          if (seen.has(emp.linkedin_profile_url)) continue
          seen.add(emp.linkedin_profile_url)

          candidates.push({
            sourceId: 'linkedin',
            externalId: emp.linkedin_profile_url,
            name: emp.full_name || emp.name || 'Unknown',
            headline: emp.title || emp.headline,
            location: emp.location,
            profileUrl: emp.linkedin_profile_url,
            avatarUrl: emp.profile_pic_url,
            skills: emp.skills || [],
            rawData: emp,
          })
        }

        await new Promise(r => setTimeout(r, 300))
      }
    } catch (fallbackErr) {
      console.error('Employee search also failed:', fallbackErr)
      throw fallbackErr
    }
  }

  return candidates
}
