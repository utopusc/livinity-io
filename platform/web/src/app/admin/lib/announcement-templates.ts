// Prebuilt announcement templates (GOAL-templates). Each is a preset the admin
// loads into the visual builder. Block `id`s here are placeholders — the form
// regenerates a fresh crypto.randomUUID() per block on load so poll/feedback
// block_ids stay unique within an announcement (the feedback write-back keys on
// block_id). NO hardcoded colors — blocks render natively via design tokens.
//
// Phase 293 (Wave 1): library grown 5 → 15, each template now carries a short
// `description` + an `icon` (emoji) so the visual gallery (template-gallery.tsx)
// can render a browsable card grid grouped by `kind`. `icon` is optional —
// `templateIcon()` falls back to a per-kind default.
import type { AnnouncementBlock, Announcement } from './announcements-api';

export type AnnouncementTemplate = {
  key: string;
  label: string;
  kind: Announcement['kind'];
  title: string;
  description: string;
  icon?: string; // emoji; falls back to KIND_ICON[kind]
  blocks: AnnouncementBlock[];
};

// Default icon per kind — used when a template doesn't set its own `icon`.
export const KIND_ICON: Record<Announcement['kind'], string> = {
  announcement: '📣',
  campaign: '🎟️',
  promo: '🛍️',
  feature: '✨',
  feedback: '💬',
};

// Human label per kind — used by the gallery to group cards.
export const KIND_LABEL: Record<Announcement['kind'], string> = {
  announcement: 'Announcements',
  campaign: 'Campaigns',
  promo: 'Promos',
  feature: 'Features',
  feedback: 'Feedback',
};

export function templateIcon(t: AnnouncementTemplate): string {
  return t.icon || KIND_ICON[t.kind] || '📄';
}

export const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    key: 'announcement',
    label: 'New-content announcement',
    kind: 'announcement',
    title: "What's new in LivOS",
    description: 'Share what shipped with a short note and a changelog link.',
    icon: '📣',
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
    description: 'Time-limited discount with a verify-and-claim call to action.',
    icon: '🎓',
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
    description: 'Show off a new app with a hero image and a one-click store link.',
    icon: '🛍️',
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
    description: 'Walk users through a new feature with numbered steps.',
    icon: '✨',
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
    description: 'Ask for a quick rating plus an open-ended comment.',
    icon: '💬',
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
  {
    key: 'maintenance',
    label: 'Scheduled maintenance',
    kind: 'feature',
    title: 'Scheduled maintenance',
    description: 'Give users a heads-up about planned downtime and when it lands.',
    icon: '🛠️',
    blocks: [
      { id: 'm-h', type: 'heading', text: 'Scheduled maintenance' },
      {
        id: 'm-b',
        type: 'text',
        text: 'We’re performing planned maintenance to keep LivOS fast and reliable. Some apps may be briefly unavailable during this window.',
      },
      { id: 'm-when', type: 'step', title: 'When', body: 'Sunday 02:00–04:00 UTC. No action needed — your data is safe.' },
    ],
  },
  {
    key: 'changelog',
    label: 'Release changelog',
    kind: 'announcement',
    title: "What's new this release",
    description: 'A tidy list of what changed, with a link to the full changelog.',
    icon: '📝',
    blocks: [
      { id: 'cl-h', type: 'heading', text: "What's new this release" },
      { id: 'cl-s1', type: 'step', title: 'New', body: 'A feature you’ve been asking for is now live across the fleet.' },
      { id: 'cl-s2', type: 'step', title: 'Improved', body: 'Faster startup and smoother window management throughout.' },
      { id: 'cl-s3', type: 'step', title: 'Fixed', body: 'Squashed a batch of bugs reported by the community.' },
      { id: 'cl-cta', type: 'button', label: 'Full changelog', href: 'https://livinity.io/changelog' },
    ],
  },
  {
    key: 'nps-survey',
    label: 'NPS survey (0–10)',
    kind: 'feedback',
    title: 'How are we doing?',
    description: 'Classic Net Promoter Score — a 0–10 scale plus an open comment.',
    icon: '📊',
    blocks: [
      { id: 'nps-h', type: 'heading', text: 'How are we doing?' },
      { id: 'nps-b', type: 'text', text: 'On a scale of 0 to 10, how likely are you to recommend LivOS to a friend or colleague?' },
      {
        id: 'nps-poll',
        type: 'poll',
        question: 'Your score (0 = not at all, 10 = extremely likely)',
        options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      },
      { id: 'nps-free', type: 'feedback', prompt: "What's the main reason for your score?" },
    ],
  },
  {
    key: 'onboarding',
    label: 'Welcome / onboarding',
    kind: 'feature',
    title: 'Welcome to LivOS 👋',
    description: 'Get brand-new users to their first win in three steps.',
    icon: '🚀',
    blocks: [
      { id: 'ob-h', type: 'heading', text: 'Welcome to LivOS 👋' },
      { id: 'ob-s1', type: 'step', title: '1 · Pick your apps', body: 'Open the store and install the apps you use every day.' },
      { id: 'ob-s2', type: 'step', title: '2 · Make it yours', body: 'Set a wallpaper and a theme in Settings to feel at home.' },
      { id: 'ob-s3', type: 'step', title: '3 · Ask Liv', body: 'Use the command bar at the top to ask Liv anything.' },
      { id: 'ob-cta', type: 'button', label: 'Get started', href: 'https://livinity.io' },
    ],
  },
  {
    key: 'event-invite',
    label: 'Event invite',
    kind: 'promo',
    title: "You're invited",
    description: 'Invite users to a launch, webinar, or AMA with an RSVP button.',
    icon: '📅',
    blocks: [
      { id: 'ev-h', type: 'heading', text: "You're invited" },
      { id: 'ev-img', type: 'image', url: 'https://livinity.io/og.png', alt: 'Event banner' },
      {
        id: 'ev-b',
        type: 'text',
        text: 'Join us live for a walkthrough of what’s next for LivOS, plus a Q&A with the team. Seats are limited.',
      },
      { id: 'ev-cta', type: 'button', label: 'RSVP', href: 'https://livinity.io/events' },
    ],
  },
  {
    key: 'security-alert',
    label: 'Security update',
    kind: 'announcement',
    title: 'Important security update',
    description: 'Notify users about a security fix and what (if anything) to do.',
    icon: '🔒',
    blocks: [
      { id: 'sa-h', type: 'heading', text: 'Important security update' },
      {
        id: 'sa-b',
        type: 'text',
        text: 'We’ve shipped a security update for LivOS. There’s nothing you need to do — your desktop updates automatically. Read the details for the specifics.',
      },
      { id: 'sa-cta', type: 'button', label: 'Learn more', href: 'https://livinity.io/security' },
    ],
  },
  {
    key: 'downtime',
    label: 'Incident / status',
    kind: 'announcement',
    title: "We're investigating an issue",
    description: 'Acknowledge an active incident and point to the status page.',
    icon: '⚠️',
    blocks: [
      { id: 'dt-h', type: 'heading', text: "We're investigating an issue" },
      {
        id: 'dt-b',
        type: 'text',
        text: 'Some users may be seeing errors. Our team is on it and we’ll keep this updated until it’s resolved.',
      },
      { id: 'dt-step', type: 'step', title: 'Status', body: 'Investigating · last updated just now. Follow the status page for live updates.' },
    ],
  },
  {
    key: 'upsell-pro',
    label: 'Upgrade to Pro',
    kind: 'campaign',
    title: 'Unlock LivOS Pro',
    description: 'Nudge free users toward a paid upgrade with the key benefits.',
    icon: '⭐',
    blocks: [
      { id: 'up-h', type: 'heading', text: 'Unlock LivOS Pro' },
      {
        id: 'up-b',
        type: 'text',
        text: 'Go Pro for more storage, priority support, and early access to new apps. Upgrade in a couple of clicks.',
      },
      { id: 'up-cta', type: 'button', label: 'Upgrade to Pro', href: 'https://livinity.io/pricing' },
    ],
  },
  {
    key: 'beta-invite',
    label: 'Beta invite',
    kind: 'feature',
    title: 'Try the beta',
    description: 'Invite power users to opt into an early-access beta.',
    icon: '🧪',
    blocks: [
      { id: 'bt-h', type: 'heading', text: 'Try the beta' },
      {
        id: 'bt-b',
        type: 'text',
        text: 'We’re testing something new and would love your feedback. Beta features are still rough around the edges — and that’s the fun part.',
      },
      { id: 'bt-cta', type: 'button', label: 'Join the beta', href: 'https://livinity.io/beta' },
    ],
  },
  {
    key: 'seasonal',
    label: 'Seasonal promo',
    kind: 'promo',
    title: 'Happy holidays from LivOS 🎉',
    description: 'A festive, seasonal promo with a banner image and an offer.',
    icon: '🎉',
    blocks: [
      { id: 'sn-h', type: 'heading', text: 'Happy holidays from LivOS 🎉' },
      { id: 'sn-img', type: 'image', url: 'https://livinity.io/og.png', alt: 'Seasonal banner' },
      {
        id: 'sn-b',
        type: 'text',
        text: 'To celebrate the season, we’re running a limited-time offer for the whole community. Grab it before it’s gone.',
      },
      { id: 'sn-cta', type: 'button', label: 'See the offer', href: 'https://livinity.io' },
    ],
  },
  {
    key: 'product-launch',
    label: 'Product launch (countdown)',
    kind: 'feature',
    title: 'Something big is coming',
    description: 'Build hype with a callout, a two-column pitch, and a live countdown.',
    icon: '🛫',
    blocks: [
      { id: 'pl-h', type: 'heading', text: 'Something big is coming' },
      { id: 'pl-callout', type: 'callout', tone: 'info', text: 'Early access opens to everyone the moment the timer hits zero.' },
      { id: 'pl-cols', type: 'columns', left: 'Faster, smoother, and built on everything you told us.', right: 'No migration, no downtime — it just shows up on your desktop.' },
      { id: 'pl-divider', type: 'divider' },
      { id: 'pl-countdown', type: 'countdown', label: 'Launching in', until: '' },
      { id: 'pl-cta', type: 'button', label: 'Notify me', href: 'https://livinity.io', variant: 'primary' },
    ],
  },
  {
    key: 'gallery',
    label: 'Image gallery',
    kind: 'promo',
    title: 'Take a look',
    description: 'A swipeable image carousel to show off screenshots or photos.',
    icon: '🎠',
    blocks: [
      { id: 'gl-h', type: 'heading', text: 'Take a look' },
      {
        id: 'gl-carousel',
        type: 'image-carousel',
        urls: ['https://livinity.io/og.png', 'https://livinity.io/og.png'],
      },
      { id: 'gl-b', type: 'text', text: 'Swipe through to see what’s new. There’s a lot to explore.' },
      { id: 'gl-cta', type: 'button', label: 'Explore', href: 'https://livinity.io', variant: 'secondary' },
    ],
  },
];

export function getTemplate(key: string): AnnouncementTemplate | undefined {
  return ANNOUNCEMENT_TEMPLATES.find((t) => t.key === key);
}
