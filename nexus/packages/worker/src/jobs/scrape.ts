import { Job } from 'bullmq';
import { logger } from '../logger.js';

const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';

export class ScrapeJob {
  static async process(job: Job): Promise<{ success: boolean; message: string; data?: any }> {
    const { url, format = 'markdown' } = job.data;

    if (!url) {
      return { success: false, message: 'No URL provided' };
    }

    logger.info(`Scraping: ${url}`);

    try {
      // Use Firecrawl API
      const response = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          formats: [format],
          waitFor: 3000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`Firecrawl error: ${response.status}`, { body: errText });
        return { success: false, message: `Scrape failed: ${response.status}` };
      }

      const result = await response.json();
      const content = result.data?.[format] || result.data?.markdown || 'No content extracted';

      logger.info(`Scraped ${url}: ${content.length} chars`);

      return {
        success: true,
        message: `Scraped ${url} (${content.length} chars)`,
        data: { url, content: content.substring(0, 10000), format },
      };
    } catch (err) {
      logger.error(`Scrape error: ${(err as Error).message}`);
      return { success: false, message: `Scrape error: ${(err as Error).message}` };
    }
  }
}
