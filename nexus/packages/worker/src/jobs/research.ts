import { Job } from 'bullmq';
import { logger } from '../logger.js';

const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';

export class ResearchJob {
  static async process(job: Job): Promise<{ success: boolean; message: string; data?: any }> {
    const { query, depth = 3 } = job.data;

    if (!query) {
      return { success: false, message: 'No research query provided' };
    }

    logger.info(`Researching: "${query}" (depth: ${depth})`);

    try {
      // Step 1: Search Google via Firecrawl map
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      const mapResponse = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: searchUrl, formats: ['markdown'] }),
      });

      let searchResults = '';
      if (mapResponse.ok) {
        const mapData = await mapResponse.json();
        searchResults = mapData.data?.markdown || '';
      }

      // Step 2: Extract top URLs and scrape them
      const urlRegex = /https?:\/\/[^\s\)>\]"]+/g;
      const urls = [...new Set(searchResults.match(urlRegex) || [])].slice(0, depth);

      const contents: Array<{ url: string; content: string }> = [];

      for (const url of urls) {
        try {
          const scrapeRes = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, formats: ['markdown'], waitFor: 3000 }),
          });

          if (scrapeRes.ok) {
            const data = await scrapeRes.json();
            const markdown = data.data?.markdown || '';
            if (markdown.length > 100) {
              contents.push({ url, content: markdown.substring(0, 3000) });
            }
          }
        } catch {
          // Skip failed URLs
        }
      }

      logger.info(`Research complete: ${contents.length} sources found`);

      return {
        success: true,
        message: `Researched "${query}": ${contents.length} sources`,
        data: { query, sources: contents },
      };
    } catch (err) {
      logger.error(`Research error: ${(err as Error).message}`);
      return { success: false, message: `Research error: ${(err as Error).message}` };
    }
  }
}
