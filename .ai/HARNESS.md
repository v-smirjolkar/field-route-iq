# AI validation harness

Run with `npm run ai:harness`.

The harness is intentionally small and deterministic:
- loads `.ai/repo-profile.json` and `.ai/validation-contract.json`
- installs dependencies only when needed
- runs validation in cheap-to-expensive order: lint -> test -> build
- writes full logs to `.ai/logs/` and keeps only compact state in `.ai/loop-state.json`

It decides what to fix next from the current failure fingerprint and the smallest file set found in the failing output. For repo work, follow the short Copilot iteration prompt in the repository instructions and keep changes scoped to the current root cause.

Inspect final results from `.ai/loop-state.json` and the latest log in `.ai/logs/`.
