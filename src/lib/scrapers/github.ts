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

function buildQuery(role: string, location: string): string {
  const techTerms: Record<string, string[]> = {
    'machine learning': ['machine-learning', 'pytorch', 'tensorflow'],
    'ml engineer': ['machine-learning', 'deep-learning'],
    'backend': ['api', 'microservices', 'golang'],
    'frontend': ['react', 'typescript', 'javascript'],
    'devops': ['kubernetes', 'terraform', 'docker'],
    'security': ['security', 'cryptography', 'infosec'],
    'identity': ['oauth', 'openid', 'authentication', 'iam'],
    'ciam': ['oauth', 'openid', 'authentication'],
    'iam': ['oauth', 'openid', 'authentication', 'iam'],
    'auth': ['oauth', 'openid', 'authentication'],
    'data': ['data-science', 'pandas', 'spark'],
  }

  const roleLower = role.toLowerCase()
  let topics: string[] = []
  for (const [key, vals] of Object.entries(techTerms)) {
    if (roleLower.includes(key)) {
      topics = vals
      break
    }
  }

  const locationQuery = location &&
    !location.toLowerCase().includes('global') &&
    !location.toLowerCase().includes('remote')
    ? `location:"${location}"`
    : ''

  // If no topics matched, search by role keywords in bio
  if (topics.length === 0) {
    const keywords = role.split(' ').slice(0, 2).join('+')
    return `${keywords} in:bio followers:>10 repos:>2 ${locationQuery}`.trim()
  }

  return `${topics.map(t => `topic:${t}`).join(' ')} followers:>50 repos:>5 ${locationQuery}`.trim()
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

  const query = buildQuery(role, location)
  const perPage = Math.min(limit, 30)
  const pages = Math.ceil(limit / perPage)

  const candidates: RawCandidate[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= pages && candidates.length < limit; page++) {
    const searchRes = await axios.get(
      `${BASE}/search/users?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&sort=followers`,
      { headers: headers() }
    )

    const items: Array<{ login: string; avatar_url: string; html_url: string }> =
      searchRes.data.items || []

    const batch = items.slice(0, limit - candidates.length)
    await Promise.all(
      batch.map(async (item) => {
        if (seen.has(item.login)) return
        seen.add(item.login)

        try {
          const [profileRes, { stats, skills }] = await Promise.all([
            axios.get<GHUser>(`${BASE}/users/${item.login}`, { headers: headers() }),
            getUserStats(item.login),
          ])

          const user = profileRes.data

          // Skip organizations — only include real people
          if (user.type === 'Organization') return

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
          // Skip profiles that fail
        }
      })
    )

    await sleep(1000)
  }

  return candidates.slice(0, limit)
}

function estimateYearsFromCreatedAt(createdAt: string): number {
  const created = new Date(createdAt).getFullYear()
  const now = new Date().getFullYear()
  return Math.max(0, now - created)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
