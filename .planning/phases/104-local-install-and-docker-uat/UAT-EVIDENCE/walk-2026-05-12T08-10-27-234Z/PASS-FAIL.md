# Phase 104 UAT Walk — 2026-05-12T08-10-27-234Z

| AC ID | Status | Evidence |
|-------|--------|----------|
| AC-104-13 | PASS | 13-*.txt |
| AC-104-14 | PASS | 14-*.txt |
| AC-104-1 | PASS | 1-*.txt |
| AC-104-2 | PASS | 2-*.txt |
| AC-104-4 | PASS | 4-*.txt |
| AC-104-5 | PASS | 5-*.txt |
| AC-104-6 | WARN | 6-*.txt |
| AC-104-7 | WARN | 7-*.txt |
| AC-104-9 | WARN | 9-*.txt |
| AC-104-10 | USER-WALKED | 10-*.txt |
| AC-104-11 | PASS | 11-*.txt |
| AC-104-15 | WARN | 15-*.txt |

## Notes

- AC-104-10 is USER-WALKED on a real Apple device — see UAT-CHECKLIST.md.
- AC-104-6/-7 may be WARN if livinityd has not been started + local.activate not called yet.
- AC-104-12 (Mini PC `update.sh` parity) is verified by the cloud-regression container (plan 104-06), not here.
- AC-104-3 / AC-104-16 are covered by other plans (104-06 / 104-02 respectively).
