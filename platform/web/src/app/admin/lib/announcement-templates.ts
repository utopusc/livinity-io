// Prebuilt announcement templates (GOAL-templates). Each is a preset the admin
// loads into the visual builder. Block `id`s here are placeholders — the form
// regenerates a fresh crypto.randomUUID() per block on load so poll/feedback
// block_ids stay unique within an announcement (the feedback write-back keys on
// block_id). NO hardcoded colors — blocks render natively via design tokens (Plan 07).
import type { AnnouncementBlock, Announcement } from './announcements-api';

export type AnnouncementTemplate = {
  key: string;
  label: string;
  kind: Announcement['kind'];
  title: string;
  blocks: AnnouncementBlock[];
};

export const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    key: 'announcement',
    label: 'New-content announcement',
    kind: 'announcement',
    title: "What's new in LivOS",
    blocks: [
      { id: 't-h', type: 'heading', text: "What's new in LivOS" },
      {
        id: 't-b',
        type: 'text',
        text: "We've shipped new features to make your LivOS desktop faster and friendlier. Here's a quick look at what changed.",
      },
      { id: 't-cta', type: 'button', label: 'See the changelog', href: 'https://livinity.io/changelog' },
    ],
  },
  {
    key: 'campaign',
    label: 'Student discount / campaign',
    kind: 'campaign',
    title: 'Student discount — 50% off',
    blocks: [
      { id: 'c-h', type: 'heading', text: 'Students get 50% off' },
      {
        id: 'c-b',
        type: 'text',
        text: 'Verify your student status and unlock half-price LivOS for the whole school year. Limited time.',
      },
      { id: 'c-cta', type: 'button', label: 'Claim your discount', href: 'https://livinity.io/students' },
    ],
  },
  {
    key: 'promo',
    label: 'Product promo',
    kind: 'promo',
    title: 'Meet the new app',
    blocks: [
      { id: 'p-h', type: 'heading', text: 'Meet the new app' },
      { id: 'p-img', type: 'image', url: 'https://livinity.io/og.png', alt: 'Product preview' },
      {
        id: 'p-b',
        type: 'text',
        text: 'A brand-new app just landed in the LivOS store. Install it in one click and try it today.',
      },
      { id: 'p-cta', type: 'button', label: 'Open the store', href: 'https://livinity.io/store' },
    ],
  },
  {
    key: 'feature',
    label: 'Feature reveal (step-by-step)',
    kind: 'feature',
    title: 'Introducing a new feature',
    blocks: [
      { id: 'f-h', type: 'heading', text: 'Introducing a new feature' },
      { id: 'f-s1', type: 'step', title: 'Step 1 — Open it', body: 'Find the new entry in your dock or the command bar.' },
      { id: 'f-s2', type: 'step', title: 'Step 2 — Try it', body: 'Follow the on-screen hints to get your first result in seconds.' },
      { id: 'f-cta', type: 'button', label: 'Try it now', href: 'https://livinity.io' },
    ],
  },
  {
    key: 'feedback',
    label: 'Feedback request',
    kind: 'feedback',
    title: 'Tell us what you think',
    blocks: [
      { id: 'fb-h', type: 'heading', text: 'Help shape LivOS' },
      { id: 'fb-b', type: 'text', text: 'Your input directly guides what we build next. It takes 20 seconds.' },
      {
        id: 'fb-poll',
        type: 'poll',
        question: 'How likely are you to recommend LivOS to a friend?',
        options: ['Very likely', 'Somewhat likely', 'Not sure', 'Unlikely'],
      },
      { id: 'fb-free', type: 'feedback', prompt: 'Anything else you want us to know?' },
    ],
  },
];

export function getTemplate(key: string): AnnouncementTemplate | undefined {
  return ANNOUNCEMENT_TEMPLATES.find((t) => t.key === key);
}
