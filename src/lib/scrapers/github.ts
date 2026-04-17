export async function scrapeGitHub(
  role: string,
  location: string,
  limit: number
): Promise<RawCandidate[]> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not set')
  }

  const query = buildQuery(role, location)
  const candidates: RawCandidate[] = []
  const seen = new Set<string>()

  // Direct single search call
  const searchRes = await axios.get(
    `${BASE}/search/users?q=${encodeURIComponent(query)}&per_page=30&page=1&sort=followers`,
    { headers: headers() }
  )

  const items: Array<{ login: string }> = searchRes.data.items || []

  for (const item of items.slice(0, limit)) {
    if (seen.has(item.login)) continue
    seen.add(item.login)

    try {
      const [profileRes, { stats, skills }] = await Promise.all([
        axios.get<GHUser>(`${BASE}/users/${item.login}`, { headers: headers() }),
        getUserStats(item.login),
      ])

      const user = profileRes.data
      if (user.type === 'Organization') continue

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
