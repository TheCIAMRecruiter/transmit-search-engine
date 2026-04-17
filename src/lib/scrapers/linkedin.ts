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

  // Use Role Lookup endpoint — finds people by job title at companies
  const companies = [
    'google', 'microsoft', 'amazon', 'meta', 'apple',
    'openai', 'anthropic', 'stripe', 'uber', 'airbnb',
    'netflix', 'salesforce', 'nvidia', 'twitter', 'linkedin'
  ]

  for (const company of companies) {
    if (candidates.length >= limit) break

    try {
      const res = await axios.get(
        `${BASE}/linkedin/company/employee/search`,
        {
          headers: headers(),
          params: {
            linkedin_company_profile_url: `https://www.linkedin.com/company/${company}`,
            keyword_regex: role,
            page_size: 3,
          }
        }
      )

      const employees = res.data?.employees || res.data?.results || []

      for (const emp of employees) {
        if (candidates.length >= limit) break

        const profileUrl = emp.linkedin_profile_url
        if (!profileUrl) continue

        // Enrich profile
        try {
          const profileRes = await axios.get(
            `${BASE}/linkedin`,
            {
              headers: headers(),
              params: {
                linkedin_profile_url: profileUrl,
                use_cache: 'if-present',
              }
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
        } catch {
          // skip failed enrichments
        }

        await new Promise(r => setTimeout(r, 300))
      }
    } catch (err) {
      console.error(`LinkedIn error for ${company}:`, err)
    }
  }

  return candidates
}
