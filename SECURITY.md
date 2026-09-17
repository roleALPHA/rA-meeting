# Security

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's [private vulnerability reporting](https://github.com/roleALPHA/rA-meeting/security/advisories/new). It gives us a place to talk before anything is public.

Tell us what you found, how to reach it, and what an attacker gets out of it. A proof of concept helps; a sentence that explains the consequence helps more. Do not include real meeting content, transcripts or tenant identifiers.

You will hear back within a week. If a report turns out to be valid we will agree a disclosure date with you and credit you in the advisory unless you would rather we did not.

## What this product is, for the purposes of a report

rA Meetings is a SharePoint Framework package that runs **entirely in the user's browser**, inside the customer's Microsoft 365 tenant. There is no roleALPHA service behind it: data lives in the customer's SharePoint site, and calls go out with the signed-in user's delegated Entra ID tokens. A finding here is a finding in software other organisations install, so the fix has to reach administrators before the details do.

The trust model is described in [docs/technical-deployment.md](docs/technical-deployment.md#security-model-and-trust-boundary). The short version: **SharePoint permissions are the only enforced access boundary.**

## The boundaries worth attacking

- **Origins and paths.** The web part only talks to SharePoint sites on the current tenant's HTTPS host and only to an allowlist of REST paths. A way to make it send the user's SharePoint session or a token to another origin is serious.
- **Tokens.** Tokens are requested only for Microsoft Graph and for the configured AI and roleALPHA audiences. A token for one audience reaching another endpoint, or any credential persisted in browser storage or SharePoint, is a finding.
- **The two outbound interfaces.** The configured roleALPHA MCP endpoint and the configured AI provider are the only external destinations. Content reaching any other destination, or a configuration that can be bent to one, is a finding.
- **Untrusted content.** Transcripts, meeting content, AI responses and MCP responses are untrusted input. Script execution from them, or an AI or MCP response that makes the app write something the user did not confirm, is a finding.
- **Transfers to roleALPHA.** Writes require an approved outcome and are never retried automatically. A way to cause an unapproved or duplicate write is a finding.

## Not vulnerabilities

- A site reader being able to read stored content, including transcripts and historical versions. That is how SharePoint permissions work, and it is documented.
- A site editor changing stored content directly in SharePoint, bypassing the app's rules. Those rules guide users; they are not security controls, and the consistency check is documented as detection, not prevention.
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
