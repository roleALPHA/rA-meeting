# Continuous integration and releases

Binding for changes to workflows under `.github/`, to the licence policy, and to the release mechanics. The setup follows [GoodWorkshop](https://github.com/roleALPHA/good-workshop)'s pipeline; its Docker and database jobs are replaced by the SharePoint package build.

## What it costs

GitHub Actions is free on standard runners for public repositories, and so are CodeQL, dependency review and secret scanning. Every workflow here runs on `ubuntu-latest`. If the repository ever becomes private, CodeQL and dependency review need GitHub Advanced Security, and the minutes count against the organisation's quota.

## Workflows

### `ci.yml` — on pull request, push to `main`, nightly and on demand

Jobs run **in parallel**, not as a chain:

| Job                            | Contents                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint` — Lint & Typecheck      | `tsc --noEmit`, ESLint (hook dependencies, no hex colours in client code, no German text in components), Prettier check, licence policy and index                         |
| `dco` — Sign-off               | Pull requests only: every commit carries a `Signed-off-by` trailer matching its author. Bots and merge commits are exempt. [CONTRIBUTING.md](../CONTRIBUTING.md) says why |
| `unit` — Unit Tests            | The node test runner over `tests/` and `scripts/`, with coverage thresholds on `shared/`; `coverage/lcov.info` as an artifact                                             |
| `package` — SharePoint Package | `npm run spfx:install` and `npm run spfx:build`; the `.sppkg` as an artifact                                                                                              |

The `package` job exists because the SPFx toolchain compiles the generated bundle again with its own settings. That fails in cases where `tsc` and the tests pass, and it has to fail in the pull request that caused it.

**The nightly run is not redundant.** Nothing here is hermetic: the lockfiles pin packages but not the registry, the SPFx toolchain downloads its own Node.js, and the runner image is rebuilt weekly. GitHub disables a scheduled workflow after 60 days without repository activity and says so by e-mail — a silent nightly is a stopped nightly, not a passing one.

### `codeql.yml` — on push, pull request and weekly

CodeQL with `security-extended` over `javascript-typescript` and over the workflows themselves. The weekly run catches findings that arrive with updated query packs rather than with changed code. The generated SPFx bundle is excluded, because it is a minified copy of `client/`.

### `dependency-review.yml` — on pull request

Fails when a pull request adds a dependency with a known vulnerability of `moderate` or higher, or one under a licence on the deny list.

### `release.yml` — on tag `v*`

1. Checks that the tag equals `v` + the version in `spfx/package.json`, which is what SharePoint shows.
2. Runs the full `npm run build`, checks included.
3. Writes `THIRD-PARTY-LICENSES.txt` and `sbom.cdx.json` (CycloneDX 1.6, reproducible) with `scripts/licenses.mjs`.
4. Keeps all four files as an artifact, then creates the GitHub release from the tag annotation if it does not exist and attaches `rolealpha-meetings.sppkg`, `LICENSE.md`, `THIRD-PARTY-LICENSES.txt` and `sbom.cdx.json`.

A manual run builds the same files without publishing anything.

## Cutting a release

1. In a pull request, raise `version` in `package.json` **and** `spfx/package.json` (the build rejects a mismatch). Squash-merge it as `vX.Y.Z: <summary>`.
2. Tag the merge commit with an annotated tag whose message is the release note, and push it:

   ```bash
   git tag -a v1.2.0 -m "v1.2.0: <summary>" && git push origin v1.2.0
   ```

3. Check that the release carries the four files.

## Licence policy

`scripts/licenses.mjs` reads the lockfiles, not `node_modules`, so the check needs no install. It walks the production closure of `package.json` and of `spfx/package.json` without the `@microsoft/sp-*` packages SharePoint provides at runtime. Every licence has to be in `ALLOWED` with a reason; `REFUSED` names why strong copyleft and service-restricted licences cannot ship.

`THIRD-PARTY-LICENSES.md` is the committed index, without versions so that Dependabot bumps do not change it. After adding or removing a dependency, run `npm run licenses:write` and commit the diff — the diff is the review.

## Conventions

- **Every action is pinned to a full commit SHA** with the version in a comment. Dependabot keeps the pins current (`.github/dependabot.yml` covers actions, the root and `spfx/`).
- **`permissions:` minimal.** `contents: read` by default; `security-events: write` only in CodeQL, `contents: write` only in the release job.
- **`concurrency` in every workflow.** `ci.yml` puts the event name into the group, so a nightly run and a push to `main` do not cancel each other. The release is never cancelled.
- **Values reach scripts through `env:`**, never as `${{ }}` inside `run:`.
- **SPFx toolchain updates move together.** Dependabot groups `@microsoft/*` and `@rushstack/*` and ignores their minor and major versions; an SPFx upgrade is a deliberate change with a full build and a tenant test.
- **Job names are required checks.** Renaming a job removes it from the ruleset without any error; update the ruleset in the same change.

## Repository settings

These are part of the setup, not preferences:

- Secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting.
- Squash merges only; branches are deleted after merge.
- A **ruleset** on the default branch: no deletion, no force push, pull request required, squash only, and these required checks: `Lint & Typecheck`, `Sign-off`, `Unit Tests`, `SharePoint Package`, `Analyse javascript-typescript`, `Analyse actions`, `Review dependencies`.

Approvals are deliberately not required. A single maintainer cannot approve their own pull request; the checks are the gate. There is no classic branch protection in addition to the ruleset — two mechanisms that disagree are worse than one.
