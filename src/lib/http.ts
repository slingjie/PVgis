export async function fetchJson<T>(
  url: string,
  opts: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: opts.headers,
        signal: controller.signal,
        cache: "no-store"
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 400)}` : ""}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("fetchJson failed");
}

export async function fetchText(
  url: string,
  opts: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
  } = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: opts.headers,
        signal: controller.signal,
        cache: "no-store"
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 400)}` : ""}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("fetchText failed");
}
