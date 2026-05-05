import { Job } from 'bullmq';
import { logger } from '../logger.js';

const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';

interface Lead {
  company: string;
  url: string;
  description: string;
  emails?: string[];
  socials?: string[];
}

export class LeadgenJob {
  static async process(job: Job): Promise<{ success: boolean; message: string; data?: any }> {
    const { query, maxLeads = 20 } = job.data;

    if (!query) {
      return { success: false, message: 'No leadgen query provided' };
    }

    logger.info(`Lead generation: "${query}" (max: ${maxLeads})`);

    try {
      const leads: Lead[] = [];

      // Search for companies matching the query
      const searchQueries = [
        `${query} companies list 2025`,
        `top ${query} startups`,
        `${query} SaaS tools directory`,
      ];

      for (const sq of searchQueries) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(sq)}&num=10`;

        const res = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: searchUrl, formats: ['markdown'] }),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const markdown = data.data?.markdown || '';

        // Extract URLs from results
        const urlRegex = /https?:\/\/(?!www\.google)[^\s\)>\]"]+/g;
        const urls = [...new Set(markdown.match(urlRegex) || [])].slice(0, 5);

        for (const url of urls) {
          if (leads.length >= maxLeads) break;

          try {
            const pageRes = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url, formats: ['markdown'] }),
            });

            if (!pageRes.ok) continue;
            const pageData = await pageRes.json();
            const content = pageData.data?.markdown || '';

            // Extract basic lead info
            const emailRegex = /[\w.-]+@[\w.-]+\.\w{2,}/g;
            const emailMatches: string[] = content.match(emailRegex) || [];
            const emails: string[] = [...new Set(emailMatches)].filter(
              (e: string) => !e.includes('example') && !e.includes('test')
            );

            const domain = new URL(url as string).hostname.replace('www.', '');

            leads.push({
              company: domain,
              url: url as string,
              description: (content as string).substring(0, 200).replace(/\n/g, ' '),
              emails: emails.slice(0, 3),
            });
          } catch {
            // Skip
          }
        }

        if (leads.length >= maxLeads) break;
      }

      logger.info(`Lead generation complete: ${leads.length} leads found`);

      return {
        success: true,
        message: `Found ${leads.length} leads for "${query}"`,
        data: { query, leads },
      };
    } catch (err) {
      logger.error(`Leadgen error: ${(err as Error).message}`);
      return { success: false, message: `Leadgen error: ${(err as Error).message}` };
    }
  }
}
