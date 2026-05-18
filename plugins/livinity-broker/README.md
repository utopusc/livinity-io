# livinity-broker plugin

The first v37 reference plugin. Ships as `livinity-broker.livpkg.tgz`
via GitHub releases on `utopusc/livinity-apps`.

## Package layout

```
livinity-broker/
├── plugin-manifest.json    # SPEC §3.2 manifest
├── plugin-manifest.sig     # generated at signing time (NOT committed)
├── backend/
│   └── index.mjs           # PluginBackendModule
├── ui/
│   └── bundle.umd.js       # generated at build time (NOT committed; v37 stub)
└── migrations/
    └── 0001_init.sql       # plugin_livinity_broker schema
```

## Build (operator)

```sh
# from repo root
cd plugins/livinity-broker
tar --owner=0 --group=0 --numeric-owner -czf ../livinity-broker.livpkg.tgz \
  plugin-manifest.json backend/ migrations/

# sign — Ed25519 key kept on operator's offline machine
node -e "
  const fs = require('fs');
  const { sign, createPrivateKey } = require('crypto');
  const key = createPrivateKey({
    key: fs.readFileSync('OPERATOR_PRIVATE_KEY.pem'),
    format: 'pem',
  });
  const bytes = fs.readFileSync('plugin-manifest.json');
  const sig = sign(null, bytes, key);
  fs.writeFileSync('plugin-manifest.sig', sig.toString('hex'));
"

# repack with signature
tar --owner=0 --group=0 --numeric-owner -czf ../livinity-broker.livpkg.tgz \
  plugin-manifest.json plugin-manifest.sig backend/ migrations/

# compute bundle sha256
shasum -a 256 ../livinity-broker.livpkg.tgz
```

Then:
1. Update Supabase `apps.livinity-broker.manifest.bundleSha256` to the
   actual hash.
2. Push the .tgz as a GitHub release asset on `utopusc/livinity-apps`
   under tag `livinity-broker-1.0.0`.

## v37 limitations

- The backend `anthropicMessages` / `openaiChatCompletions` handlers
  return 503 — actual proxy logic still lives in livinityd's
  livinity-broker module and is reached via the user's subdomain
  directly. v38 will extract the full proxy into this plugin.
- UI bundle is a stub. Settings widget renders "managed by livinityd"
  until v38.

## Operator UAT (post Mini PC deploy)

1. `bash /opt/livos/update.sh` deploys this directory under
   `/opt/livos/repo/plugins/livinity-broker/`.
2. Operator builds + signs the .tgz, uploads to GitHub release.
3. Updates Supabase row's `manifest.bundleSha256`.
4. In /store → Plugins → Livinity Broker → Install.
5. livinityd downloads, verifies, extracts to `/opt/livos/plugins/livinity-broker/`,
   runs migration, hot-mounts.
6. Smoke: `curl https://<user>.livinity.io/p/livinity-broker/v1/messages -d '{}'` →
   503 with v37 stub note (success — proxy not yet wired).
