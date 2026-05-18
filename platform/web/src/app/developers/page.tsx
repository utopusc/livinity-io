import Link from 'next/link';

export default function DevelopersPage() {
  return (
    <div className="dev-shell">
      <header className="dev-topbar">
        <Link href="/" className="dev-brand">
          <span className="dev-brand-mark" aria-hidden="true" />
          <span>Livinity</span>
          <span className="dev-brand-crumb">Developers</span>
        </Link>
        <div className="dev-topbar-links">
          <a href="https://github.com/utopusc/livinity-apps" target="_blank" rel="noreferrer">
            livinity-apps
          </a>
          <Link href="/store">Store</Link>
        </div>
      </header>

      <section className="dev-hero">
        <div className="dev-eyebrow">Plugin SDK · v37.0</div>
        <h1 className="dev-title">
          Extend LivOS with <em>signed plugins.</em>
        </h1>
        <p className="dev-desc">
          A LivOS plugin ships routes, widgets, slash commands and MCP servers
          as a single signed bundle. The runtime mounts plugins at{' '}
          <code>{'<user>'}.livinity.io/p/&lt;plugin-id&gt;/</code> with no
          server restart on install. Operator-signed for v37; community
          submissions open in v38.
        </p>
        <div className="dev-actions">
          <a
            href="https://github.com/utopusc/livinity-apps"
            target="_blank"
            rel="noreferrer"
            className="install primary"
          >
            View on GitHub
          </a>
          <Link href="#manifest" className="install ghost">
            Read the spec
          </Link>
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">01 · what a plugin is</div>
        <h2 className="dev-section-title">
          One bundle. Four <em>hooks.</em>
        </h2>
        <p className="dev-section-desc">
          A plugin is a <code>.livpkg.tgz</code> archive that LivOS extracts
          into <code>/opt/livos/plugins/&lt;id&gt;/</code>. The runtime reads
          the manifest, verifies the Ed25519 signature, and mounts whichever
          of the four hook types the plugin declares.
        </p>
        <div className="dev-grid-2">
          <div className="dev-card">
            <div className="dev-card-eyebrow">Routes</div>
            <h4>HTTP endpoints</h4>
            <p>
              Mounted under <code>/p/&lt;id&gt;/</code> on the user's
              livinityd. Standard Express handlers — request, response, async
              middleware. Useful for webhook receivers, reverse proxies, and
              custom APIs that need to live on the user's own domain.
            </p>
          </div>
          <div className="dev-card">
            <div className="dev-card-eyebrow">Widgets</div>
            <h4>UI components</h4>
            <p>
              Pre-compiled UMD bundles rendered into mount points across the
              LivOS shell — dock, settings panel, AI chat, window titlebar.
              Shadow-DOM by default for CSS isolation.
            </p>
          </div>
          <div className="dev-card">
            <div className="dev-card-eyebrow">Commands</div>
            <h4>AI chat slash commands</h4>
            <p>
              Plugin-declared <code>/foo</code> commands appear in the user's
              Liv chat. The runtime routes args + session context to the
              plugin's handler and injects the response back into the
              conversation as a tool result.
            </p>
          </div>
          <div className="dev-card">
            <div className="dev-card-eyebrow">MCPs</div>
            <h4>MCP servers</h4>
            <p>
              Register MCP servers (stdio or streamableHttp transport) into
              the user's <code>mcpConfigManager</code>. Same shape AI Chat
              uses today — your plugin's tools become available to the local
              Liv assistant on install.
            </p>
          </div>
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">02 · package layout</div>
        <h2 className="dev-section-title">
          What goes <em>inside</em> a <code>.livpkg.tgz</code>
        </h2>
        <p className="dev-section-desc">
          Everything the runtime needs to mount, sign and load the plugin
          lives in the archive. No external resources are fetched at install
          time except the bundle URL itself.
        </p>
        <div className="dev-code">
{`hello-world.livpkg.tgz
├── plugin-manifest.json     # this spec
├── plugin-manifest.sig      # Ed25519 detached signature over plugin-manifest.json
├── backend/
│   └── index.mjs            # default export = PluginBackendModule
├── ui/
│   ├── bundle.umd.js        # pre-compiled UMD, mounted via plugin loader
│   └── styles.css           # optional, Shadow-DOM scoped by default
├── migrations/
│   └── 0001_init.sql        # optional, run by livinityd at install
└── assets/
    └── icon.svg             # optional, served at /p/<id>/_assets/icon.svg`}
        </div>
      </section>

      <section id="manifest" className="dev-section">
        <div className="dev-section-eyebrow">03 · manifest</div>
        <h2 className="dev-section-title">
          <code>plugin-manifest.json</code>
        </h2>
        <p className="dev-section-desc">
          One JSON file declares the plugin's identity, signing tier, every
          hook it exposes, and every capability it needs. The runtime
          refuses install if a capability is requested beyond the plugin's
          signing tier.
        </p>
        <div className="dev-code">
{`{
  `}<span className="c-key">{`"manifestVersion"`}</span>{`: `}<span className="c-str">{`"1.0.0"`}</span>{`,
  `}<span className="c-key">{`"id"`}</span>{`: `}<span className="c-str">{`"hello-world"`}</span>{`,
  `}<span className="c-key">{`"version"`}</span>{`: `}<span className="c-str">{`"1.0.0"`}</span>{`,
  `}<span className="c-key">{`"name"`}</span>{`: `}<span className="c-str">{`"Hello World"`}</span>{`,
  `}<span className="c-key">{`"tagline"`}</span>{`: `}<span className="c-str">{`"Reference plugin for the LivOS SDK"`}</span>{`,
  `}<span className="c-key">{`"author"`}</span>{`: `}<span className="c-str">{`"Livinity"`}</span>{`,
  `}<span className="c-key">{`"signing"`}</span>{`: {
    `}<span className="c-key">{`"tier"`}</span>{`: `}<span className="c-str">{`"operator"`}</span>{`,
    `}<span className="c-key">{`"publicKeyId"`}</span>{`: `}<span className="c-str">{`"operator-v1"`}</span>{`,
    `}<span className="c-key">{`"signedAt"`}</span>{`: `}<span className="c-str">{`"2026-05-18T00:00:00Z"`}</span>{`
  },
  `}<span className="c-key">{`"hooks"`}</span>{`: {
    `}<span className="c-key">{`"routes"`}</span>{`: [
      { `}<span className="c-key">{`"path"`}</span>{`: `}<span className="c-str">{`"/ping"`}</span>{`, `}<span className="c-key">{`"method"`}</span>{`: `}<span className="c-str">{`"GET"`}</span>{`, `}<span className="c-key">{`"handler"`}</span>{`: `}<span className="c-str">{`"pingHandler"`}</span>{` }
    ],
    `}<span className="c-key">{`"widgets"`}</span>{`: [
      { `}<span className="c-key">{`"mount"`}</span>{`: `}<span className="c-str">{`"dock"`}</span>{`, `}<span className="c-key">{`"component"`}</span>{`: `}<span className="c-str">{`"DockWidget"`}</span>{` }
    ],
    `}<span className="c-key">{`"commands"`}</span>{`: [
      { `}<span className="c-key">{`"slash"`}</span>{`: `}<span className="c-str">{`"/hello"`}</span>{`, `}<span className="c-key">{`"handler"`}</span>{`: `}<span className="c-str">{`"helloCommand"`}</span>{`, `}<span className="c-key">{`"description"`}</span>{`: `}<span className="c-str">{`"Say hello"`}</span>{` }
    ]
  },
  `}<span className="c-key">{`"capabilities"`}</span>{`: {
    `}<span className="c-key">{`"redis"`}</span>{`: [{ `}<span className="c-key">{`"keyPattern"`}</span>{`: `}<span className="c-str">{`"liv:plugin:hello-world:*"`}</span>{`, `}<span className="c-key">{`"access"`}</span>{`: `}<span className="c-str">{`"readwrite"`}</span>{` }]
  },
  `}<span className="c-key">{`"minLivosVersion"`}</span>{`: `}<span className="c-str">{`"37.0.0"`}</span>{`
}`}
        </div>
        <div className="dev-pillrow">
          <span className="dev-pill">manifestVersion: 1.0.0</span>
          <span className="dev-pill">Ed25519 signature</span>
          <span className="dev-pill">redis capability scopes</span>
          <span className="dev-pill">postgres capability scopes</span>
          <span className="dev-pill">filesystem capability scopes</span>
          <span className="dev-pill">network capability declared</span>
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">04 · backend module</div>
        <h2 className="dev-section-title">
          What <code>backend/index.mjs</code> exports
        </h2>
        <p className="dev-section-desc">
          A single default export — a <code>PluginBackendModule</code> with
          activate / deactivate lifecycle hooks plus the named handlers
          referenced from the manifest.
        </p>
        <div className="dev-code">
{`export default {
  async `}<span className="c-key">{`onActivate`}</span>{`(api) {
    api.log.info(`}<span className="c-str">{`'hello-world activated'`}</span>{`);
    `}<span className="c-cmt">{`// api.redis / api.pg / api.fs are namespaced + cap-checked`}</span>{`
    await api.redis.set(`}<span className="c-str">{`'liv:plugin:hello-world:greeting'`}</span>{`, `}<span className="c-str">{`'hi'`}</span>{`);
  },

  async `}<span className="c-key">{`onDeactivate`}</span>{`(api) {
    api.log.info(`}<span className="c-str">{`'hello-world deactivated'`}</span>{`);
  },

  `}<span className="c-key">{`handlers`}</span>{`: {
    `}<span className="c-cmt">{`// referenced by manifest.hooks.routes[].handler`}</span>{`
    `}<span className="c-key">{`pingHandler`}</span>{`(req, res) {
      res.json({ ok: `}<span className="c-num">{`true`}</span>{`, at: `}<span className="c-str">{`'/p/hello-world/ping'`}</span>{` });
    },
  },

  `}<span className="c-key">{`commands`}</span>{`: {
    `}<span className="c-cmt">{`// referenced by manifest.hooks.commands[].handler`}</span>{`
    async `}<span className="c-key">{`helloCommand`}</span>{`(args, ctx) {
      return \`hi @\${ctx.userId} — you said: "\${args}"\`;
    },
  },
};`}
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">05 · ui bundle</div>
        <h2 className="dev-section-title">
          UMD bundle, <em>Shadow-DOM</em> isolated
        </h2>
        <p className="dev-section-desc">
          Plugins expose React components via a UMD wrapper. The plugin
          loader injects each declared widget into its mount point using
          <code>React.createPortal</code> wrapped in a Shadow-DOM root, so
          plugin CSS never leaks into the LivOS shell and vice versa.
        </p>
        <div className="dev-code">
{`// ui/bundle.umd.js
(function (factory) { `}<span className="c-cmt">{`/* UMD prelude */`}</span>{` })(function () {
  return {
    `}<span className="c-cmt">{`// names match manifest.hooks.widgets[].component`}</span>{`
    `}<span className="c-key">{`DockWidget`}</span>{`(props) {
      return React.createElement(`}<span className="c-str">{`'div'`}</span>{`, {
        style: { padding: `}<span className="c-num">{`8`}</span>{` },
      }, `}<span className="c-str">{`'Hello, dock'`}</span>{`);
    },
  };
});`}
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">06 · publishing</div>
        <h2 className="dev-section-title">
          Submission <em>flow</em>
        </h2>
        <p className="dev-section-desc">
          v37 ships operator-signed-only. Community submissions open in v38
          via this repo. For now, contact the operator and they'll co-sign
          and publish under <code>operator-v1</code>.
        </p>
        <div>
          <div className="dev-step">
            <div className="dev-step-num">01</div>
            <div>
              <h3 className="dev-step-title">Fork <code>utopusc/livinity-apps</code></h3>
              <p className="dev-step-desc">
                The plugin repository hosts release artifacts and the public
                signing-key registry at <code>.signing/pubkeys.json</code>.
              </p>
            </div>
          </div>
          <div className="dev-step">
            <div className="dev-step-num">02</div>
            <div>
              <h3 className="dev-step-title">Build your <code>.livpkg.tgz</code></h3>
              <p className="dev-step-desc">
                Pack <code>plugin-manifest.json</code>, <code>backend/</code>,
                <code>ui/</code>, <code>migrations/</code> and <code>assets/</code> into
                a tarball. Run <code>npm pack</code> after structuring your
                directory.
              </p>
            </div>
          </div>
          <div className="dev-step">
            <div className="dev-step-num">03</div>
            <div>
              <h3 className="dev-step-title">Request co-sign</h3>
              <p className="dev-step-desc">
                Open a pull request adding the bundle hash + manifest to
                <code>plugins/&lt;your-id&gt;/</code>. Operator reviews,
                signs <code>plugin-manifest.sig</code> with the operator key, and
                publishes a release.
              </p>
            </div>
          </div>
          <div className="dev-step">
            <div className="dev-step-num">04</div>
            <div>
              <h3 className="dev-step-title">Catalog entry</h3>
              <p className="dev-step-desc">
                The operator adds a row to the Supabase <code>apps</code>{' '}
                table with <code>section=&apos;plugin&apos;</code>, pointing at the
                GitHub release URL + bundle SHA-256. Once committed it's live
                in the /store within seconds.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="dev-section">
        <div className="dev-section-eyebrow">07 · reference plugins</div>
        <h2 className="dev-section-title">
          Production examples
        </h2>
        <div className="dev-grid-3">
          <div className="dev-card">
            <div className="dev-card-eyebrow">hello-world</div>
            <h4>Reference</h4>
            <p>
              The minimal plugin that touches every hook type — route + dock
              widget + slash command + redis capability. Use this as your
              starting fork.
            </p>
          </div>
          <div className="dev-card">
            <div className="dev-card-eyebrow">livinity-broker</div>
            <h4>The first plugin</h4>
            <p>
              Claude API at <code>/p/livinity-broker/v1/*</code> via the
              user's Anthropic subscription. Demonstrates path-mounted routes
              and a plugin-managed settings widget.
            </p>
          </div>
          <div className="dev-card">
            <div className="dev-card-eyebrow">SDK types</div>
            <h4>@livinity/plugin-sdk</h4>
            <p>
              TypeScript types for the manifest schema and the runtime API
              your backend module receives. Drop into <code>devDependencies</code>{' '}
              to get autocomplete for free.
            </p>
          </div>
        </div>
      </section>

      <footer className="dev-footer">
        <div>v37.0 · operator-signed-only · community tier in v38</div>
        <div>
          <a
            href="https://github.com/utopusc/livinity-apps"
            target="_blank"
            rel="noreferrer"
          >
            livinity-apps repo →
          </a>
        </div>
      </footer>
    </div>
  );
}
