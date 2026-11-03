const requests = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(request: Request, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const address = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const requestKey = `${key}:${address}`;
  const current = requests.get(requestKey);

  if (!current || current.resetAt <= now) {
    requests.set(requestKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;
  if (requests.size > 10000) {
    for (const [entryKey, entry] of requests) if (entry.resetAt <= now) requests.delete(entryKey);
  }
  return { allowed: current.count <= limit, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
}
