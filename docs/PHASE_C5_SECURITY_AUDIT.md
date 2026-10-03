# Phase C.5 dependency security audit

Audit baseline: commit `02af2ca227576d4506e918c0e543c265463dad94`.

## Findings

`npm audit --json` reported 5 high-severity entries, all in the development-only ESLint chain:

- `eslint-config-next@16.3.8` (direct dev dependency)
- `@next/eslint-plugin-next@16.3.8` (transitive dev dependency)
- `fast-glob@3.3.1` (transitive)
- `micromatch@4.0.8` (transitive)
- `braces@3.0.3` (transitive)

The underlying advisory is `GHSA-vfj7-8cjw-p6xm`: stack-exhaustion denial of service in `braces` through deeply nested patterns. npm reports the affected range as `<=3.0.3`.

## Dependency path and exposure

`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`.

This chain is used by lint/build tooling and is not bundled into the browser application runtime. The practical exposure for this frontend is therefore limited to developer/CI linting of repository-controlled glob patterns; it is not a customer-input request path.

## Remediation decision

npm's automated fix proposes `eslint-config-next@14.2.35`, which is a semver-major downgrade relative to the app's Next.js 16.3.8 toolchain. That would intentionally desynchronize Next and its ESLint preset, so it was not applied.

A patch override to `braces@3.0.4` was tested in CI, but npm returned `ETARGET`: no such published version exists. Therefore the five audit entries remain open rather than being falsely marked fixed.

Recommended future fix: move to the first compatible `eslint-config-next` / `@next/eslint-plugin-next` release whose dependency graph no longer resolves to the vulnerable `braces` range, then rerun the full lint/typecheck/build/browser gate.
