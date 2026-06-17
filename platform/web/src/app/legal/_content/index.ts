import type { LegalDoc } from './types';
import { terms } from './terms';
import { privacy } from './privacy';
import { acceptableUse } from './acceptable-use';
import { cookies } from './cookies';
import { refund } from './refund';

export type { LegalDoc };

// Display + sitemap order for the /legal hub and footers.
export const LEGAL_DOCS: LegalDoc[] = [terms, privacy, acceptableUse, cookies, refund];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}
