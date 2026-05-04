export interface RetryOptions {
  retries?: number;
  retryDelayMs?: number;
}

export interface FetchJsonOptions extends RetryOptions {
  endpoint: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export async function fetchJson<T>({
  endpoint,
  headers,
  signal,
  retries = 0,
  retryDelayMs = 500,
}: FetchJsonOptions): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(endpoint, { headers, signal });

      if (!response.ok) {
        throw new Error(`${endpoint} returned ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (signal.aborted || attempt >= retries) {
        throw error;
      }

      await delay(retryDelayMs * (attempt + 1), signal);
      attempt += 1;
    }
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      { once: true }
    );
  });
}
