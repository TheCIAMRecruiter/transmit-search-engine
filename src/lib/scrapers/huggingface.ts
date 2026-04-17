// src/lib/scrapers/huggingface.ts
// Hugging Face public API — great for AI/ML talent
// Docs: https://huggingface.co/docs/hub/api

import axios from 'axios'
import type { RawCandidate } from '../types'

const BASE = 'https://huggingface.co/api'

interface HFUser {
  id: string
  fullname: string
  name: string        // username / handle
  email?: string
  avatarUrl: string
  details?: string
  location?: string
  numModels: number
  numDatasets: number
  numSpaces: number
  numLikes: number
  isFollowing?: boolean
  followerCount: number
}

interface HFModel {
  id: string
  downloads: number
  likes: number
  tags: string[]
  lastModified: string
}

async function getUserModels(username: string): Promise<HFModel[]> {
  try {
    const res = await axios.get<HFModel[]>(
      `${BASE}/models?author=${username}&sort=likes&limit=10`,
      {
        headers: process.env.HUGGINGFACE_TOKEN
          ? { Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}` }
          : {},
      }
    )
    return res.data || []
  } catch {
    return []
  }
}

function extractSkillsFromHFTags(tags: string[]): string[] {
  const normalized = tags.map(t => t.toLowerCase())
  const skillMap: Record<string, string> = {
    'pytorch': 'PyTorch',
    'tensorflow': 'TensorFlow',
    'jax': 'JAX',
    'transformers': 'Transformers',
    'text-generation': 'LLMs',
    'text-classification': 'NLP',
    'object-detection': 'Computer Vision',
    'image-classification': 'Computer Vision',
    'reinforcement-learning': 'RL',
    'diffusers': 'Diffusion Models',
    'gguf': 'Model Quantization',
    'fine-tuning': 'Fine-tuning',
    'rlhf': 'RLHF',
  }
  const found: string[] = []
  for (const tag of normalized) {
    for (const [key, val] of Object.entries(skillMap)) {
      if (tag.includes(key) && !found.includes(val)) found.push(val)
    }
  }
  return found.slice(0, 8)
}

export async function scrapeHuggingFace(
  role: string,
  _location: string,
  limit: number
): Promise<RawCandidate[]> {
  // Only pull HF for ML/AI roles
  const isMLRole = /machine.?learning|ml|ai|nlp|llm|deep.?learning|research/i.test(role)
  if (!isMLRole) return []

  const headers = process.env.HUGGINGFACE_TOKEN
    ? { Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}` }
    : {}

  try {
    // Get top users by model downloads/likes
    const usersRes = await axios.get<HFUser[]>(
      `${BASE}/users?sort=numModels&limit=${Math.min(limit * 2, 50)}`,
      { headers }
    )

    const users = usersRes.data || []
    const candidates: RawCandidate[] = []

    for (const user of users.slice(0, limit)) {
      try {
        const models = await getUserModels(user.name)
        const allTags = models.flatMap(m => m.tags || [])
        const totalDownloads = models.reduce((s, m) => s + (m.downloads || 0), 0)
        const totalLikes = models.reduce((s, m) => s + (m.likes || 0), 0)
        const skills = extractSkillsFromHFTags(allTags)

        if (skills.length === 0 && models.length === 0) continue

        candidates.push({
          sourceId: 'huggingface' as RawCandidate['sourceId'],
          externalId: user.id || user.name,
          name: user.fullname || user.name,
          headline: user.details || `${user.numModels} models · ${totalDownloads.toLocaleString()} downloads`,
          location: user.location,
          profileUrl: `https://huggingface.co/${user.name}`,
          avatarUrl: user.avatarUrl,
          skills,
          yearsOfExperience: undefined,
          rawData: {
            ...user,
            models,
            totalDownloads,
            totalLikes,
          } as unknown as Record<string, unknown>,
        })

        await new Promise(r => setTimeout(r, 150))
      } catch {
        // skip
      }
    }

    return candidates
  } catch (err) {
    console.error('HuggingFace scrape error:', err)
    return []
  }
}
