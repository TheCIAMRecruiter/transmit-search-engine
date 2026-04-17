function buildQuery(role: string, location: string): string {
  const techTerms: Record<string, string[]> = {
    'machine learning': ['machine-learning', 'pytorch', 'tensorflow'],
    'ml engineer': ['machine-learning', 'deep-learning'],
    'backend': ['api', 'microservices', 'golang'],
    'frontend': ['react', 'typescript', 'javascript'],
    'devops': ['kubernetes', 'terraform', 'docker'],
    'security': ['security', 'cryptography', 'infosec'],
    'identity': ['oauth', 'openid', 'authentication'],
    'ciam': ['oauth', 'openid', 'authentication'],
    'iam': ['oauth', 'openid', 'iam'],
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

  // Use topic search if we have matches, otherwise use language fallback
  if (topics.length > 0) {
    return `topic:${topics[0]} followers:>10 ${locationQuery}`.trim()
  }

  // Fallback: search popular languages with location
  return `language:python language:typescript followers:>50 ${locationQuery}`.trim()
}
