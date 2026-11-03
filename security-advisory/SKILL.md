---
name: security-advisory
description: Use when drafting, reviewing, or publishing a security advisory (GHSA, CVE) for a vulnerability in your own project.
---

# Security advisory

## Keep it private until published

- Keep the vulnerability out of public commits, PRs, issues, release notes, docs and agent skills until the advisory is public.
- Draft it in a private doc that reviewers can comment on, not in the repo.

## Research

### Find precedents

Copy the length, sections and severity reasoning of 2–3 advisories with the same bug class and deployment shape (proxy, edge worker, SDK).
- In-house: `gh api repos/<org>/<repo>/security-advisories` for each repo in the org, archived ones included. Admins also see drafts.
- By weakness: `gh api "/advisories?cwes=<n>&per_page=100"`, then filter summaries for the bug's keywords.
- By package: `gh api "/advisories?affects=<pkg>"` for vendors whose products resemble yours.

### Verify facts against release tags

Tickets and incident docs drift from the code.
- Affected range starts at the first release that contains the bug, not the PR that introduced it.
- Check what reaches the bug: HTTP methods, routes, and which headers are stripped. Each one changes the impact.

## Severity

### Match the closest precedent's vector

An advisory with the same bug class and the same CVSS vector is the strongest argument for a score. List the plausible scores above and below yours as an open question for Security.

### Link the calculator

Link `https://www.first.org/cvss/calculator/3.1#CVSS:3.1/<vector>` so reviewers can check the score in one click.

## Content

### Give no exploit recipe

Name the bug class, not the payload. Leave out the vulnerable line, example URLs and request patterns.
- BAD: "`../` sequences in the `file` query parameter of `/download` escape the upload directory."
- GOOD: "Improper path validation in the download endpoint allows reading files outside the upload directory."

### Write impact in security vocabulary

Use standard terms (arbitrary JavaScript execution, SSRF, session hijacking), not plain-language paraphrases. Lead with the worst realistic outcome, then list what it enables. Mitigating facts, such as stripped headers, go in Impact.
- BAD: "An attacker can put their own content on your page."
- GOOD: "An attacker can craft a link that, when opened, executes arbitrary JavaScript in the context of the origin."

### Split affected users

In "Are you affected?", separate users the vendor already patched (managed, auto-updated) from those who must act (self-hosted, or the auto-update failed).


### Things to leave out

- No timelines, customer names, deployment counts or internal root-cause story.
- Claim "no evidence of exploitation" only if logs were actually checked.
- Internal discovery: write "Found by <org> during an internal code review" and leave the credits field empty.

## Form fields

### Ecosystem "Other"

Use it only when no supported ecosystem applies (check GitHub Actions too, not just package registries). Dependabot then sends no alerts, so the advisory page and direct outreach are the only notifications.

### Request the CVE early

Request it from the draft advisory a few days before publishing. The ID stays private until publication.

## Policy

### Check activation criteria before citing a policy

A vulnerability with no confirmed or suspected exploitation usually falls under vulnerability management (ticket label, fix deadline), not incident response (Legal review, notification deadlines).


## Publish in order

1. Get Security to review the draft.
2. Create the draft advisory and request the CVE.
3. Patch the deployments you manage, no later than the public release of the fix.
4. Release the fix, or a mitigation, that users who patch themselves can apply.
5. Notify affected customers.
6. Publish from the repository's advisory UI.
7. Add a line linking the advisory to the fixed release's notes.
