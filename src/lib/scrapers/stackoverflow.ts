// src/lib/scrapers/stackoverflow.ts
// Uses Stack Exchange public API — free, 10k req/day unauthenticated
// Docs: https://api.stackexchange.com/docs

import axios from 'axios'
import type { RawCandidate, StackOverflowStats } from '../types'

const BASE = 'https://api.stackexchange.com/2.3'

interface SOUser {
  user_id: number
  display_name: string
  location: string
  reputation: number
  answer_count: number
  question_count: number
  badge_counts: { gold: number; silver: number; bronze: number }
  link: string
  profile_image: string
  creation_date: number
  is_employee: boolean
  about_me?: string
}

interface SOAnswer {
  is_accepted: boolean
  tags: string[]
}

// Map role keywords to Stack Overflow tag sets
function roleToTags(role: string): string[] {
  const roleLower = role.toLowerCase()
  if (roleLower.includes('machine learning') || roleLower.includes('ml'))
    return ['machine-learning', 'deep-learning', 'pytorch', 'tensorflow']
  if (roleLower.includes('backend'))
    return ['python', 'go', 'node.js', 'postgresql', 'redis']
  if (roleLower.includes('frontend'))
    return ['javascript', 'typescript', 'reactjs', 'css']
  if (roleLower.includes('devops'))
    return ['docker', 'kubernetes', 'terraform', 'linux']
  if (roleLower.includes('security'))
    return ['security', 'cryptography', 'authentication', 'ssl']
  if (roleLower.includes('data'))
    return ['pandas', 'spark', 'sql', 'data-engineering']
  // Default: general senior engineering
  return ['algorithms', 'system-design', 'architecture', 'distributed-systems']
}

async function getUserAnswerStats(userId: number): Promise<{
  acceptedAnswers: number
  topTags: string[]
}> {
  try {
    const res = await axios.get<{ items: SOAnswer[] }>(
      `${BASE}/users/${userId}/answers?pagesize=50&order=desc&sort=votes&site=stackoverflow&filter=!9Z(-wzu0T`,
      {
        params: {
          key: process.env.STACKOVERFLOW_KEY,
        },
      }
    )
    const answers = res.data.items || []
    const acceptedAnswers = answers.filter(a => a.is_accepted).length
    const tagCount: Record<string, number> = {}
    for (const a of answers) {
      for (const tag of a.tags || []) {
        tagCount[tag] = (tagCount[tag] || 0) + 1
      }
    }
    const topTags = Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag)
    return { acceptedAnswers, topTags }
  } catch {
    return { acceptedAnswers: 0, topTags: [] }
  }
}

export async function scrapeStackOverflow(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  const tags = roleToTags(role)
  const candidates: RawCandidate[] = []
  const seen = new Set<number>()

  for (const tag of tags) {
    if (candidates.length >= limit) break

    try {
      const res = await axios.get<{ items: SOUser[] }>(
        `${BASE}/users`,
        {
          params: {
            pagesize: Math.min(limit - candidates.length, 100),
            order: 'desc',
            sort: 'reputation',
            site: 'stackoverflow',
            min: 1000, // minimum reputation — filters out low-quality profiles
            key: process.env.STACKOVERFLOW_KEY,
            // Note: SO API doesn't filter by tag in /users — we filter by top tags below
          },
        }
      )

      for (const user of res.data.items || []) {
        if (seen.has(user.user_id)) continue
        seen.add(user.user_id)

        const { acceptedAnswers, topTags } = await getUserAnswerStats(user.user_id)

        // Only include users whose top tags match what we're looking for
        const overlap = topTags.filter(t =>
          tags.some(rt => t.includes(rt) || rt.includes(t))
        )
        if (overlap.length === 0 && tags.length > 0) continue

        const soStats: StackOverflowStats = {
          reputation: user.reputation,
          answersCount: user.answer_count,
          acceptedAnswers,
          badgeGold: user.badge_counts?.gold || 0,
          badgeSilver: user.badge_counts?.silver || 0,
        }

        const createdYear = new Date(user.creation_date * 1000).getFullYear()
        const yearsOnSO = new Date().getFullYear() - createdYear

        candidates.push({
          sourceId: 'stackoverflow',
          externalId: String(user.user_id),
          name: user.display_name,
          headline: user.about_me?.replace(/<[^>]*>/g, '').slice(0, 120),
          location: user.location,
          profileUrl: user.link,
          avatarUrl: user.profile_image,
          skills: topTags,
          yearsOfExperience: yearsOnSO,
          stackOverflowStats: soStats,
          rawData: user as unknown as Record<string, unknown>,
        })

        await new Promise(r => setTimeout(r, 200))
      }
    } catch (err) {
      console.error(`SO scrape error for tag ${tag}:`, err)
    }
  }

  return candidates.slice(0, limit)
}
