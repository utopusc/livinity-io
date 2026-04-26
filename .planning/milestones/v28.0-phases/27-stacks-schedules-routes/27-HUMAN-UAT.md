---
status: partial
phase: 27-stacks-schedules-routes
source: [27-VERIFICATION.md]
started: 2026-04-25T21:35:00Z
updated: 2026-04-25T21:35:00Z
---

## Tests

### 1. Stack expand-row click feel
expected: Click stack name → row expands; Containers + Graph tabs visible; constituent-container click → ContainerDetailSheet slides over.
why_human: UX feel needs interaction.
result: [pending]

### 2. Deploy Stack 3-tab dialog UX
expected: AddStack dialog has YAML / Git / AI tabs; switching preserves form state where appropriate; submission paths all work.
why_human: Multi-tab form interaction.
result: [pending]

### 3. Webhook URL panel display
expected: After Git deploy, webhook URL panel shows generated URL + copy button.
why_human: Display correctness post-deploy.
result: [pending]

### 4. AddGitCredential nested dialog
expected: Clicking "Add credential" inside Git tab → nested dialog opens; on save, parent select auto-selects new credential.
why_human: Nested dialog state management.
result: [pending]

### 5. Programmatic deep-link via DevTools
expected: From console: `useDockerResource.getState().setSelectedStack('myproject')` → Stacks section opens with myproject row expanded.
why_human: Side-effect verification.
result: [pending]

### 6. Schedules per-row actions
expected: Run Now / Toggle / Edit / Delete buttons all work on each job row; toast feedback.
why_human: Live mutation behavior.
result: [pending]

### 7. AddBackup destination form switching + Test Destination
expected: Switch destination type (S3 / SFTP / Local) → form fields swap; Test Destination button executes probe + shows result.
why_human: Live S3/SFTP credentials roundtrip.
result: [pending]

### 8. Volume pre-fill seam end-to-end
expected: From Volumes section, click "Schedule backup" on a volume → section flips to Schedules + AddBackup dialog auto-opens with volume pre-filled in the field.
why_human: Cross-section consume-and-clear semantics.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

(none — runtime UAT only)
