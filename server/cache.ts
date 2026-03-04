import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key)
  return data ? (JSON.parse(data) as T) : null
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value)
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, serialized)
  } else {
    await redis.set(key, serialized)
  }
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key)
}

export { redis }
