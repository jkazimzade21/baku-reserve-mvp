# Phase 0 – Environment Standardization

## Completed
- Added `.tool-versions` locking **python 3.11.14** and **nodejs 20.19.5** so asdf/direnv users share toolchain.
- Authored `scripts/dev_doctor.sh` + `make doctor` target to verify:
  - Required binaries: python3.11 (3.11.14), node, npm, openssl.
  - Optional tooling: watchman, pkg-config, libffi presence, `.venv` check.
- `make doctor` currently reports missing optional `pkg-config` (acceptable warning) while confirming installed versions.

## Next Up
- Regenerate `package-lock.json` + Python dependency lock (pip-tools or poetry) once worktree clean.
- Extend doctor script with:
  - `npm ci --dry-run` check
  - `pip list --outdated` summary
- Publish instructions in README for running `make doctor` before contributing.
