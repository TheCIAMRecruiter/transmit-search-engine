import axios from 'axios'
import type { RawCandidate, GitHubStats } from '../types'

const BASE = 'https://api.github.com'
const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

interface GHUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name: string | null
  company: string | null
  blog: string | null
  location: string | null
  bio: string | null
  hireable: boolean | null
  public_repos: number
  followers: number
  following: number
  created_at: string
  type: string
}

interface GHRepo {
  stargazers_count: number
  forks_count: number
  language: string | null
  pushed_at: string
}

function buildQuery(role: string): string {
  const techTerms: Record<string, string> = {
    'machine learning': 'machine-learning',
    'ml engineer': 'machine-learning',
    'backend': 'api',
    'frontend': 'react',
    'devops': 'kubernetes',
    'security': 'security',
    'identity': 'oauth',
    'ciam': 'oauth',
    'iam': 'iam',
    'auth': 'oauth',
    'data': 'data-science',
    'python': 'python',
    'golang': 'golang',
    'rust': 'rust',
  }

  const roleLower = role.toLowerCase()
  let topic = ''
  for (const [key, val] of Object.entries(techTerms)) {
    if (roleLower.includes(key)) {
      topic = val
      break
    }
  }

  if (topic) {
    return `topic:${topic} followers:>50`
  }

  // Fallback — search by most common languages
  return `language:python followers:>100`
}

async function getUserStats(login: string): Promise<{
  stats: GitHubStats
  skills: string[]
}> {
  const reposRes = await axios.get<GHRepo[]>(
    `${BASE}/users/${login}/repos?per_page=100&sort=stars`,
    { headers: headers() }
  )
  const repos = reposRes.data

  const totalStars = repos.reduce((s, r) => s + r.stargazers_count, 0)
  const totalForks = repos.reduce((s, r) => s + r.forks_count, 0)

  const langCount: Record<string, number> = {}
  for (const r of repos) {
    if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1
  }
  const topLanguages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang)

  const now = Date.now()
  const oneYear = 365 * 24 * 60 * 60 * 1000
  const activeRepos = repos.filter(r => {
    const pushed = new Date(r.pushed_at).getTime()
    return now - pushed < oneYear
  })

  return {
    stats: {
      followers: 0,
      publicRepos: repos.length,
      totalStars,
      totalForks,
      contributionDays: Math.min(activeRepos.length * 12, 365),
      topLanguages,
      hireable: null,
    },
    skills: topLanguages,
  }
}

export async function scrapeGitHub(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not set')
  }

  const query = buildQuery(role)
  const candidates: RawCandidate[] = []
  const seen = new Set<string>()

  const isGlobal = /global|remote|worldwide/i.test(location)
  const locationLower = location.toLowerCase()

  const searchRes = await axios.get(
    `${BASE}/search/users?q=${encodeURIComponent(query)}&per_page=50&page=1&sort=followers`,
    { headers: headers() }
  )

  const items: Array<{ login: string }> = searchRes.data.items || []

  for (const item of items) {
    if (candidates.length >= limit) break
    if (seen.has(item.login)) continue
    seen.add(item.login)

    try {
      const [profileRes, { stats, skills }] = await Promise.all([
        axios.get<GHUser>(`${BASE}/users/${item.login}`, { headers: headers() }),
        getUserStats(item.login),
      ])

      const user = profileRes.data
      if (user.type === 'Organization') continue

      // Filter by location if not global
      if (!isGlobal && user.location) {
        const userLoc = user.location.toLowerCase()
        const locationWords = locationLower.split(/[\s,]+/)
        const matchesLocation = locationWords.some(word =>
          word.length > 2 && userLoc.includes(word)
        )
        if (!matchesLocation) continue
      }

      stats.followers = user.followers
      stats.hireable = user.hireable

      candidates.push({
        sourceId: 'github',
        externalId: String(user.id),
        name: user.name || user.login,
        headline: user.bio || undefined,
        location: user.location || undefined,
        profileUrl: user.html_url,
        avatarUrl: user.avatar_url,
        skills,
        yearsOfExperience: estimateYearsFromCreatedAt(user.created_at),
        githubStats: stats,
        rawData: user as unknown as Record<string, unknown>,
      })
    } catch {
      // skip
    }
  }

  return candidates.slice(0, limit)
}

function estimateYearsFromCreatedAt(createdAt: string): number {
  const created = new Date(createdAt).getFullYear()
  const now = new Date().getFullYear()
  return Math.max(0, now - created)
}

function sleep(_ms: number) {
  return new Promise(resolve => setTimeout(resolve, _ms))
}
