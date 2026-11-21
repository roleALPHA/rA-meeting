# Security

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's [private vulnerability reporting](https://github.com/roleALPHA/rA-meeting/security/advisories/new). It gives us a place to talk before anything is public.

Tell us what you found, how to reach it, and what an attacker gets out of it. A proof of concept helps; a sentence that explains the consequence helps more. Do not include real meeting content, transcripts or tenant identifiers.

You will hear back within a week. If a report turns out to be valid we will agree a disclosure date with you and credit you in the advisory unless you would rather we did not.

## What this product is, for the purposes of a report

roleALPHA Sessions is a SharePoint Framework package that runs **entirely in the user's browser**, as a side panel in Teams meetings, plus an optional Microsoft 365 Copilot agent. There is no roleALPHA Sessions server: meeting outcomes are drafts in roleALPHA, and every call goes out with the signed-in user's delegated tokens. A finding here is a finding in software other organisations install, so the fix has to reach administrators before the details do.

The trust model is described in [docs/technical-deployment.md](docs/technical-deployment.md#security-model-and-trust-boundary). The short version: **roleALPHA decides what a user may see and change; the app only proposes.**

## The boundaries worth attacking

- **Destinations.** The app talks only to Microsoft Graph (the meeting chat), the host page's SharePoint REST for one tenant property, and the roleALPHA MCP address with its token endpoint. Content or a token reaching any other destination, or a tenant property that can be bent to one, is a finding.
- **Tokens.** Tokens are requested only for Microsoft Graph and roleALPHA's audience and held in memory. A token for one audience reaching another endpoint, or any credential persisted in browser storage, is a finding.
- **Reading versus writing.** Read tools must be annotated read-only. A way to make the app call a writing tool while reading, or create a draft the user did not confirm, is a finding.
- **Untrusted content.** Meeting notes, rALPH's answers, proposals and roleALPHA results are untrusted input. Script execution from them, a link in the meeting chat summary that leads outside roleALPHA, or a proposal that changes something other than what the user saw, is a finding.
- **Submission.** The meeting's participants decide who votes where roleALPHA allows it. A way to submit someone else's scenario or to smuggle voters past roleALPHA's checks is a finding (report roleALPHA-side issues the same way).

## Not vulnerabilities

- rALPH giving a wrong or unhelpful proposal. Every proposal is shown to people and decided in roleALPHA; report harmful content with the link the app shows.
- A participant without a roleALPHA account not being able to vote. That is documented.
- Approved API permissions being usable by other SPFx solutions in the tenant. That is how SharePoint grants them to the shared client principal, and the administrator guide says so.

## Supported versions

The latest release. There is no back-porting yet.

## How a report is handled

1. **Acknowledged within a week**, through the private advisory thread.
2. **Assessed** — what an attacker gets, which versions are affected, which boundary it crosses.
3. **Fixed** without making the change public before the advisory is.
4. **Released** as a normal tagged release, with the advisory published at the same time and a CVE requested through GitHub where one is warranted.
5. **Credited** to you in the advisory unless you would rather we did not.

Administrators have to deploy a new package to their app catalog, so the advisory says which version fixes the problem and the release notes repeat it.

## Finding out what is in a release

Every [GitHub release](https://github.com/roleALPHA/rA-meeting/releases) carries, next to `rolealpha-meetings.sppkg`:

- **`sbom.cdx.json`** — a CycloneDX document with the exact version of every dependency in the package. Feed it to Dependency-Track, Grype or anything else that reads CycloneDX.
- **`THIRD-PARTY-LICENSES.txt`** — the notices and licence texts of everyone whose code is inside.

Dependabot, CodeQL (`security-extended`), dependency review and secret scanning with push protection run on this repository, and CI runs in full every night.
