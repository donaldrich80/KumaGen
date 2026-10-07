# Backlog

Open work for KumaGen. Design history lives in `docs/`; the unit contract in `docs/spec.md`.

- **Skip-only runs exit 0.** If `npm ci` was not run, every suite is skipped (visibly, with a
  reason) but `node --test` still exits 0. Making a skip non-green needs a change to
  `.test-command` (frozen by the upgrade pipeline) — e.g. a wrapper that fails on `skipped > 0`.
- **Distinct codes for AI failure modes.** Missing key, invalid JSON and provider errors all
  surface as `E05`; split them if they need separate alerting.
- **Web UI has no tests.** `web/` has no doors at the characterization level today.
