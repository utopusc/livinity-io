-- =========================================================================
-- 0021_docs.sql — admin-editable documentation (categories + articles)
--
-- Powers livinity.io/docs (public, RSC reads) and /admin/docs (requireAdmin
-- writes). Article `content` is GitHub-flavored markdown. Images (cover +
-- inline) live in the existing public `app-icons` Storage bucket under a
-- `docs/<slug>/` prefix — no new bucket required.
--
-- Idempotent (IF NOT EXISTS throughout) so it is safe to re-run.
-- =========================================================================

CREATE TABLE IF NOT EXISTS docs_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS docs_articles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id UUID NOT NULL REFERENCES docs_categories(id) ON DELETE RESTRICT,
  content     TEXT NOT NULL DEFAULT '',
  cover_url   TEXT,
  published   BOOLEAN NOT NULL DEFAULT false,
  featured    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_articles_category_id ON docs_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_docs_articles_published ON docs_articles(published, sort_order);

-- RLS on (matches every other table). No policies: only the app's pg.Pool /
-- service-role connection (which bypasses RLS) reads/writes — public reads go
-- through RSC server components, admin writes through requireAdmin(). The anon
-- key gets zero direct access, same posture as apps/users/etc.
ALTER TABLE docs_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs_articles ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- Starter content so /docs renders immediately. Editable/removable from the
-- admin panel. ON CONFLICT DO NOTHING keeps re-runs clean.
-- -------------------------------------------------------------------------
INSERT INTO docs_categories (slug, name, description, sort_order)
VALUES
  ('getting-started', 'Getting Started', 'Install LivOS and get up and running in minutes.', 10),
  ('guides', 'Guides', 'Step-by-step guides for apps, tunnels, and more.', 20)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO docs_articles (slug, title, description, category_id, content, published, featured, sort_order)
SELECT
  'installing-livos',
  'Installing LivOS',
  'A step-by-step guide to installing LivOS on your machine.',
  c.id,
  E'LivOS turns any machine into your personal AI server, accessible from anywhere via livinity.io.\n\n## Prerequisites\n\n- A 64-bit Linux machine (Ubuntu 22.04+ recommended)\n- `sudo` access\n- An internet connection\n\n## Install\n\nRun the one-line installer:\n\n```bash\ncurl -fsSL https://livinity.io/install.sh | bash\n```\n\nThe installer sets up the LivOS runtime, the local gateway, and the secure tunnel.\n\n> **Tip:** The first install can take a few minutes while dependencies download.\n\n## Verify\n\nOnce it finishes, open your dashboard:\n\n```bash\nlivos status\n```\n\nYou should see `gateway: online` and a `*.livinity.io` address. That is it — welcome to LivOS.',
  true,
  true,
  10
FROM docs_categories c
WHERE c.slug = 'getting-started'
ON CONFLICT (slug) DO NOTHING;
