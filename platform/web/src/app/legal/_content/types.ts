// Shape of a single legal/policy document. Content is git-versioned markdown
// (legal text changes rarely and benefits from an auditable history) and is
// rendered by the shared docs markdown renderer.
export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  body: string;
};
