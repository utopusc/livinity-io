# Font Sources — Phase 116-02 (snapshot 2026-05-14)

Provenance and integrity record for the four self-hosted `.woff2` font files
bundled with `@livinity/design-tokens`. Required for downstream license audits
and reproducibility per D-116-SELF-HOSTED-FONT-FALLBACK.

| File | Source | License | Size (bytes) | SHA256 |
|---|---|---|---|---|
| `Geist-Variable.woff2` | `npm pack geist@1.7.0` → `package/dist/fonts/geist-sans/Geist-Variable.woff2` | SIL OFL 1.1 | 69436 | `e24cec106619c03f0b3519e31b9bc55e0d5e926b6a95b8d798cd8cef215b1505` |
| `GeistMono-Variable.woff2` | `npm pack geist@1.7.0` → `package/dist/fonts/geist-mono/GeistMono-Variable.woff2` | SIL OFL 1.1 | 71004 | `5f687a5dd4c87da13deaff9f6b9503d5e62249ff501265a96b134565f9aa8c87` |
| `InstrumentSerif-Regular.woff2` | Google Fonts CSS API → `https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjg.woff2` (latin subset, font-style: normal) | SIL OFL 1.1 | 21032 | `5eb09b5ac0e28b67c2f041c8ba6d244604ca0c0980d65912ab2d47fed84ddc31` |
| `InstrumentSerif-Italic.woff2` | Google Fonts CSS API → `https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zAjjH7M.woff2` (latin subset, font-style: italic) | SIL OFL 1.1 | 22128 | `5a51946dfffa82972bc98745359c46761515641fda557c25116459a9f83da4a7` |

## Reproducibility

### Geist + Geist Mono (Variable)

```bash
npm pack geist@1.7.0 --pack-destination /tmp/livos-fonts
cd /tmp/livos-fonts
tar -xzf geist-1.7.0.tgz
cp package/dist/fonts/geist-sans/Geist-Variable.woff2 ./Geist-Variable.woff2
cp package/dist/fonts/geist-mono/GeistMono-Variable.woff2 ./GeistMono-Variable.woff2
```

Note: the Vercel `geist` npm package ships many static-weight files plus a
single multi-axis `*-Variable.woff2` per family. We bundle only the Variable
files (full 100..900 axis range), which keeps the package small (~140 KB
combined) while supporting all canonical weights.

### Instrument Serif (Regular + Italic)

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -fL -A "$UA" "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" > instrument-serif.css

# The returned CSS yields 4 @font-face blocks: latin-ext + latin subsets for
# each of normal (ital=0) and italic (ital=1). We bundle the `latin` subsets
# only (U+0000-00FF + common punctuation) — sufficient for English UI and
# Turkish-language code/path strings.
curl -fL -o InstrumentSerif-Regular.woff2 "https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjg.woff2"
curl -fL -o InstrumentSerif-Italic.woff2  "https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zAjjH7M.woff2"
```

Google Fonts URLs are versioned (`v5/...`) so they are stable, but if a future
Instrument Serif revision ships we may want to re-fetch.

## License

All four typefaces are licensed under the SIL Open Font License 1.1 (OFL-1.1).
Full attribution and the OFL license summary are documented in the package
root: `livos/packages/design-tokens/LICENSE-FONTS.md`.

## Integrity verification

After download, each file was confirmed as a valid WOFF2 binary:

- First 4 bytes match the WOFF2 magic header `wOF2` (hex `774f4632`).
- File size >10 KB (a 404 HTML body would be <2 KB).
- SHA256 captured above — re-run `sha256sum *.woff2` to verify nothing
  has been tampered with on disk.

Snapshot date: 2026-05-14.
