# Contributing

How to build and test the project is in the [README](README.md#local-development) and in [`docs/`](docs/). This file is the other half: the terms a contribution arrives under, and the one mechanical step that records where it came from.

## The terms your contribution is under

rA Meetings is published under the **[rA Meetings Internal Collaboration License](LICENSE.md)**. It is not an open-source licence.

Section 8 of that licence governs contributions: you may submit proposed changes to roleALPHA GmbH for review. **Submitting does not assign copyright and does not grant roleALPHA GmbH unrestricted relicensing rights.** If a contribution needs further rights to be included in a release, those are agreed separately before it is merged. Nothing in this file replaces or extends that section.

## Sign your work — the Developer Certificate of Origin

Every commit needs a `Signed-off-by` line. This is the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), the same lightweight mechanism the Linux kernel uses. It is not a contract and it transfers nothing. It records that you are allowed to submit the code you are submitting.

Git writes the line for you:

```bash
git commit -s -m "Your message"
```

To sign off work you have already committed:

```bash
git rebase --signoff main
```

CI checks this on every pull request and names the commits that are missing it. Commits made by bots are exempt — Dependabot cannot certify anything.

### What you are certifying

By signing off you certify the following (DCO 1.1, verbatim):

> By making a contribution to this project, I certify that:
>
> **(a)** The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or
>
> **(b)** The contribution is based upon previous work that, to the best of my knowledge, is covered under an appropriate open source license and I have the right under that license to submit that work with modifications, whether created in whole or in part by me, under the same open source license (unless I am permitted to submit under a different license), as indicated in the file; or
>
> **(c)** The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.
>
> **(d)** I understand and agree that this project and the contribution are public and that a record of the contribution (including all personal information I submit with it, including my sign-off) is maintained indefinitely and may be redistributed consistent with this project or the open source license(s) involved.

The DCO speaks of an "open source license". In this project, read it as the licence indicated for the project, [LICENSE.md](LICENSE.md), with contributions handled under its section 8. The sign-off is used here for what it certifies about origin, not to change the terms.

Note what (d) means for your privacy: your name and email address become a permanent, public part of the git history. Use an address you are willing to have published; GitHub's `@users.noreply.github.com` address is fine.

### Code you did not write yourself

- **Code from another project.** Only if its licence may ship inside the rA Meetings package — see the policy in [`scripts/licenses.mjs`](scripts/licenses.mjs). GPL and AGPL code cannot. Say where it came from in the commit message and keep its copyright header.
- **Code an AI assistant generated.** You are the contributor and you sign off on it. Review it like any other code before you put your name on it.

## New dependencies

A new dependency is a legal decision as much as a technical one, because it ends up inside a package that runs in customers' tenants. Check it against the architecture constraints in [CLAUDE.md](CLAUDE.md) first. CI then fails if its licence is not in the allowlist in [`scripts/licenses.mjs`](scripts/licenses.mjs), and the index in [`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md) has to be regenerated:

```bash
npm run licenses:write
```

The diff that produces is the review. If the licence is genuinely fine and simply not in the allowlist yet, add it there **with the reason**.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) has the private reporting route.
