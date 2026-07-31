---
name: release
description: Prepare and cut a new release of the rsdi package — verify the build/lint/tests are green, compare benchmarks against the last released tag to catch any performance regression, decide the semver bump from the actual API changes, write the CHANGELOG entry, and run `pnpm version`. Use this whenever the user wants to bump the version, cut or prepare a release, ship a new version, tag a release, or asks "what version should this be?" — including when they only say something like "let's release this" or "time to publish" without naming a version number.
---

# Cutting an rsdi release

The goal is a release that a consumer can trust: green checks, an honest CHANGELOG entry, and a
version number that matches what actually changed. Work through the steps in order — the ordering
matters, because `pnpm version` refuses to run on a dirty tree, so the CHANGELOG has to be committed
before the bump.

Stop after the bump. Pushing and publishing are the user's calls to make, not yours.

## Step 1 — See what is actually unreleased

```bash
git describe --tags --abbrev=0          # last released tag, e.g. v3.1.1
git log --oneline $(git describe --tags --abbrev=0)..HEAD
git diff --stat $(git describe --tags --abbrev=0)..HEAD -- src/
```

Commit subjects in this repo are unreliable for this purpose — past releases have hidden real API
changes under messages like "feat: updated readme.md", and "feat:" is used for chores. Read the diff
of `src/`, not the log.

If `src/` is untouched and the only changes are tooling, CI, or docs, **there is nothing to
release**. Say so and stop; publishing a version that changes nothing for consumers just adds noise.

## Step 2 — Decide the bump from the public surface

The public surface of this package is:

- the public methods of `DIContainer` in `src/DIContainer.ts`
- the `IDIContainer` type in `src/types.ts`
- whatever `src/index.ts` exports
- the error classes in `src/errors.ts`

This is a types-first library, so **a change that alters the types inferred for existing consumer
code is breaking even when the runtime behavior is identical.** Someone with `const c: DIContainer<X>
= …` in their codebase gets a red squiggle, and that is a broken build for them.

| Bump      | When                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **major** | Removed/renamed a method, changed a signature so existing calls stop compiling, changed resolution semantics consumers depend on   |
| **minor** | Added a method or type, widened an accepted argument type, new behavior that existing code does not see                            |
| **patch** | Bug fix, restored compatibility with an older runtime, internal refactor, dependency or tooling change that ships no source change |

Two judgment calls specific to this package:

- **Runtime-requirement changes are consumer-facing.** Switching to a newer built-in (`Object.hasOwn`
  needs Node 16.9+) silently raises the floor and can break someone in production. That deserves a
  CHANGELOG line even though nothing in the API changed. This exact thing happened in 3.1.1.
- **Formatting-only diffs are noise.** `oxfmt` rewraps `src/types.ts` regularly. Read the diff for
  semantic change before concluding the types moved.

Tell the user which bump you are proposing and the one-line reason, then let them confirm before you
change anything. Getting this wrong is expensive to undo once a version is published.

## Step 3 — Verify the checks are green locally

CI enforces this on the PR, but run it here anyway:

```bash
pnpm build && pnpm lint && pnpm test
```

The reason is not distrust of CI — it is that `pnpm version` creates a git commit, which goes through
the husky pre-commit hook. If lint is broken, the bump fails _midway_, leaving `package.json`
modified with no commit and no tag (see Gotchas). Finding out here is cheaper.

`pnpm test` covers both runtime and type tests. All three must pass before you continue. If something
fails, fix it or stop — never release around a red check.

## Step 4 — Compare performance against the last release

```bash
pnpm bench:compare
```

This builds the last released tag and the release candidate, measures both, and prints the deltas.
It takes a couple of minutes and needs a **clean working tree**, because it switches refs in place —
run it before you write the CHANGELOG, not after. It restores your branch on the way out, including
when a measurement fails.

Run it every time, even for a release you are sure is types-only. It is cheap relative to shipping a
regression, and "sure" is exactly the state in which one gets through.

### Reading the output

Two cost models, and they earn very different amounts of trust:

- **Type cost** — instantiation counts from `bench-types.mjs`. Deterministic: the same source
  produces the same number on every machine. Any delta is real, and a flag here needs no second
  opinion. A scenario reported as `BROKEN on the candidate` blocks the release outright.
- **Runtime cost** — `p75` from `vitest bench`, best of alternating rounds. Wall clock, and the
  weaker half by a wide margin. **It resolves large effects only.** A 10x wiring win is
  unmistakable; a ~35% change does not survive a busy machine and has been observed reporting the
  wrong _sign_. Rows whose own repeats disagree are printed as `unstable — not compared`, which
  means unjudged, not clean. Treat this section as a smoke alarm and the type numbers as the gate.

The runtime section is skipped entirely when the compiled output is identical to the baseline once
comments are stripped. **That is a stronger result than any measurement, not a gap in coverage** — if
the emitted JavaScript did not change, the runtime cannot have. Types-only releases normally land
here and report nothing.

### Acting on a flag

| Report                                 | What to do                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type cost up >5%                       | Real. Investigate before releasing — this is the failure mode `bench:types` budgets exist to catch, and a budget with headroom will not catch a regression that still fits inside it. |
| A scenario `BROKEN on the candidate`   | Stop. Inference degraded or a budget blew; that ships broken types to consumers.                                                                                                      |
| Runtime row flagged `← SLOWER`         | Re-run with `BENCH_COMPARE_ROUNDS=4` on an otherwise idle machine before believing it. A single pair of runs has produced a confident +47% on a path that was actually 4× faster.     |
| Runtime flag that survives more rounds | Probably real if it is large. Decide whether it is acceptable, then **say so in the CHANGELOG** — see below.                                                                          |
| Several rows `unstable — not compared` | The machine is too busy for this measurement. Close what you can and re-run, or accept that runtime went unchecked and say so when handing back. Do not read it as a pass.            |
| `no degradation`                       | Move on — bearing in mind that means "nothing large enough to detect", not "identical".                                                                                               |

### Feed the result into the CHANGELOG

This is why the step comes before Step 5 rather than after.

- **A large improvement is consumer-visible and belongs in the entry.** "Wiring a container is no
  longer quadratic" is exactly what someone deciding whether to upgrade wants to know.
- **A regression you decide to accept must be disclosed, not buried.** 3.3.0 deliberately made
  `clone()` ~35% slower to make `add` linear — a good trade, and one the entry stated plainly.
  Someone whose workload is clone-heavy needs to be able to find that.
- Small deltas that only move an internal counter are not consumer-visible. Leave them out, the same
  as any other internal change.

## Step 5 — Write the CHANGELOG entry

Add the new section at the top of `CHANGELOG.md`, under the `# Changelog` heading. Match the existing
shape: `# X.Y.Z` for the version, `## Added` / `## Fixed` / `## Changed` for groups, newest first.

**Write only what a consumer needs to know.** This is the part that is easy to get wrong by being too
thorough. The reader is someone deciding whether to upgrade and what might break — not someone
reviewing the diff.

Include:

- New or removed API, and changed signatures
- Bug fixes, described by the symptom the consumer saw
- Anything that changes runtime requirements

Leave out — even though it feels like work worth reporting:

- Internal refactors that are invisible from outside (data structure swaps, renames)
- Test, lint, formatter, CI, and dev-dependency changes
- Build and publishing script changes

One line per entry. If a release has no consumer-visible change, one sentence for the whole release
is the right length.

**Example — a release whose real content was internal:**

```markdown
# 3.1.1

Internal maintenance release. This version uses `Object.hasOwn`, so it requires Node 16.9+; later
releases restore support for older runtimes.
```

Everything else in that release — the `Set` lookup, the move from `tsd` to Vitest typechecking, the
new `prepublishOnly` script — was dropped, because none of it changes anything for someone using the
package.

**Example — a release with real API changes:**

```markdown
# 3.1.0

## Added

- `clone()` — returns a new container carrying the same resolvers.

## Fixed

- `update()` now clears the cached value for the name it replaces. Previously it kept returning the
  stale instance if the dependency had already been resolved.

## Changed

- `new DIContainer({ … })` no longer accepts resolvers — build containers with `add()`.
```

Then format and re-check: `npx oxfmt CHANGELOG.md && pnpm lint`.

## Step 6 — Commit the CHANGELOG

```bash
git add CHANGELOG.md && git commit -m "docs: changelog for <version>"
```

This is not optional housekeeping. `pnpm version` aborts on any uncommitted change, **including
staged ones**, so a left-behind CHANGELOG edit blocks the bump entirely.

## Step 7 — Bump

```bash
pnpm version patch    # or minor / major
```

This bumps `package.json`, commits it with the bare version as the message (`3.1.2`), and tags
`v3.1.2` — matching the convention already in this repo's history. Confirm both landed:

```bash
git log --oneline -1 && git tag --points-at HEAD
```

## Step 8 — Hand back

Report the new version, the tag, and what the CHANGELOG says. Then stop.

Pushing the tag and running `pnpm publish` are irreversible and outward-facing — a published npm
version cannot be recalled, only deprecated. Offer the commands and let the user run them:

```bash
git push && git push --tags
```

## Gotchas

- **`pnpm version` needs a completely clean tree.** Staged-but-uncommitted changes count as dirty and
  produce `ERR_PNPM_UNCLEAN_WORKING_TREE`. This is why the CHANGELOG is committed first.
- **`pnpm bench:compare` also needs a clean tree**, for a different reason: it checks out the baseline
  tag in place. It refuses rather than stashing on your behalf. If it is ever interrupted hard enough
  to leave you on a detached HEAD, `git checkout <your-branch>` is the whole recovery — it only ever
  touches the benchmark harness paths, and it restores those before switching back.
- **Do not benchmark an old tag in a git worktree.** `bench-types.mjs` writes its fixtures under
  `node_modules/.types-bench`, and they import `../../src`. A worktree typically symlinks
  `node_modules` back to the primary checkout, so the fixture resolves to the _primary_ `src/` and
  reports the current commit's numbers under the old tag's name. `bench:compare` switches refs in
  place to avoid exactly this.
- **A failing pre-commit hook leaves a half-bump.** If husky rejects the version commit, `pnpm
version` has already written the new number into `package.json` and staged it, but there is no
  commit and no tag. Recover with `git checkout -- package.json` before retrying — otherwise the next
  attempt bumps from the already-bumped number and skips a version.
- **`dist/` is gitignored and rebuilt on publish** by `prepublishOnly`. Never commit build output as
  part of a release.
- **The tag is the only release marker.** There is no release branch and no GitHub release automation,
  so `git describe --tags` is the source of truth for "what was last shipped".
