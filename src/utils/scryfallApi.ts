/**
 * Scryfall API Client with strict Rate Limiting
 * Enforces maximum 5 requests per second (minimum 200ms delay between calls).
 * Scryfall guidelines ask for 50-100ms, so 200ms (5 req/sec) is strictly safe and compliant.
 */

class ScryfallRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private readonly minDelayMs = 200; // 5 requests per second max

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minDelayMs) {
        await this.sleep(this.minDelayMs - elapsed);
      }
      this.lastRequestTime = Date.now();

      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error('Error executing Scryfall task:', err);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Enqueues a fetch call to Scryfall API adhering to the 5 req/sec limit
   */
  public async fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await fetch(url, {
            ...init,
            headers: {
              'User-Agent': 'MTG-Booster-EV-Studio/1.0',
              Accept: 'application/json;q=0.9,*/*;q=0.8',
              ...(init?.headers || {}),
            },
          });

          if (!res.ok) {
            throw new Error(`Scryfall API error: ${res.status} ${res.statusText}`);
          }

          const data = await res.json();
          resolve(data as T);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Direct CDN helper for Scryfall set symbols
   */
  public getSetSymbolSvgUrl(setCode: string): string {
    return `https://svgs.scryfall.io/sets/${setCode.toLowerCase().trim()}.svg`;
  }
}

export const scryfallClient = new ScryfallRateLimiter();
