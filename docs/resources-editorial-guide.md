# ProfileRelaunch Resources editorial guide

This document is for people writing, reviewing or publishing Resources. It is not a public page.

The public name is **Resources**. Do not brand this area as a Blog, Newsroom, Knowledge Base or Learning Centre.

Positioning: “Understand the policy before you make the next move.”

---

## Purpose

Resources exists to:

1. Support long-term organic search with pages that deserve to rank.
2. Demonstrate genuine subject competence.
3. Explain Google Business Profile policies and processes in plain English.
4. Help stressed business owners understand what to do before they act.
5. Create natural paths into Profile Recovery or Review Protection when that is useful.
6. Support future Policy Updates.
7. Support future Review Abuse & Scams content.

It is a specialist case desk / reference library. It is not a marketing blog, magazine, news feed or generic AI content site.

---

## Value-add rule

A resource must provide at least one genuine value-add:

- interpretation
- decision framework
- checklist
- mistake analysis
- scenario explanation
- process explanation
- source synthesis

Do **not** publish a resource merely because the keyword has search volume.

Do **not** bulk-create AI pages.

Do **not** paraphrase one Google Help page into a new page with no added value.

---

## Do not invent

Do not invent:

- case studies
- success rates
- customer examples
- statistics
- Google relationships
- policy claims
- legal claims
- named subject specialists, editorial boards, “Google-certified” experts or journalists

Author identity is **ProfileRelaunch**. Use the real operator identity on About / legal pages, not as a fabricated Resources byline.

Every factual Google-process claim should be researchable to an official or otherwise credible source when the article is written.

Never copy long passages from Google. Summarise in our own words and link to the official source.

---

## Official sources vs interpretation

Preferred source types:

- Google Business Profile Help
- Google Maps / user-contributed content policy
- Google Business Profile policies
- official Google support or process documentation

Architecture:

- **What Google says** — concise paraphrase plus official source name and link.
- **What this means for your business** — ProfileRelaunch interpretation, visually and editorially separate.
- **Official sources** — only sources actually referenced by that article. No decorative bibliography.

Do not imply Google endorsement.

---

## Draft / publish model

Registry: `lib/resources.ts`. Article bodies: `lib/resource-content.ts` (empty until Phase 1B).

Rules:

- `published: false` resources are draft metadata only.
- Drafts must not be listed on `/resources`, linked from published pages, included in related resources, included in the sitemap, or emitted as structured data.
- Visiting a draft slug returns **404**. Do not ship “Coming soon” article shells.
- Do not set `published: true` until researched content exists in the content resolver.
- Do not add thin indexable placeholder article pages.

`dateReviewed` is updated only when the article has genuinely been reviewed.

Optional policy-update fields exist for later use:

- `isPolicyUpdate`
- `reviewedAgainstSourceDate`
- `supersedesSlug`
- `changeSummary`

A line such as “Reviewed 13 September 2026 — no material process change” is allowed **only** if that review genuinely occurred.

---

## Categories

Categories are filters / sections on `/resources`. Do not create separate indexable category URLs until a later phase.

1. Profile Recovery
2. Verification & Access
3. Reviews & Reputation
4. Review Abuse & Scams (quiet “Urgent situations” label; no fear marketing)
5. Google Policy Updates — publish only when something has genuinely been reviewed and changed

If a category has no published guides, show “Guides in preparation”. Do not show “0 articles”. Do not link empty categories to missing pages.

---

## Review Abuse & Scams

The article template supports an urgent callout, including for:

Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews

Suggested callout (for the researched article, not as a public stub):

“If someone is currently demanding money, goods or services in exchange for removing reviews, preserve the messages and review links before taking further action.”

The future article may distinguish:

- ordinary customer dispute
- refund negotiation
- threat to post a genuine negative experience
- coercive review manipulation
- organised review extortion
- malicious review campaign

Do **not** automatically label every customer dispute as extortion, blackmail, fraud or criminal conduct.

Do not write legal or criminal advice. Do not use flashing alerts, countdowns or alarmist graphics.

---

## Conversion

Commercial links come after meaningful content, not in the first paragraphs.

- Profile Recovery → `/get-help?service=profile-recovery`
- Review content → `/get-help?service=review`
- General → `/get-help`

Optional related commercial link: Explore Profile Recovery or Explore Review Protection.

Editorial usefulness comes first. Do not inject commercial links every few paragraphs.

Helpers: `lib/resource-links.ts`.

---

## SEO

Published articles get unique title, meta description, canonical, Open Graph, Twitter metadata, Article JSON-LD and Breadcrumb JSON-LD.

Do not invent article image metadata if no article image exists.

Do not add FAQ schema for Resources merely to chase rich results. FAQ-style headings for readers are fine.

Once a slug is published, treat the URL as stable. Use evergreen paths under `/resources/[slug]`. Never `/blog/` or dated archive URLs.

---

## Navigation decision (Phase 1A)

Resources is **not** in the primary header. There are not enough published guides.

A low-prominence **Resources** link is in the footer Explore column. The hub itself explains the desk, the five categories and how guides are produced, so the page is useful without article cards.

Do not add a large Resources block to the homepage in this phase.

---

## Future enhancement — do not implement now

`/resources/policy-updates` may be useful later when enough genuine policy changes exist.

Do not create that route while it would be an empty indexable page.

---

## Publishing checklist

Before setting `published: true`:

1. Researched against official sources.
2. At least one genuine value-add beyond restating a Help page.
3. Official sources actually cited; interpretation separated.
4. Last reviewed date is real.
5. Reading time reflects the finished article.
6. Related slugs point at other **published** resources, or will be filtered out until they are.
7. No invented statistics, case studies, legal claims or Google relationships.
8. No thin “coming soon” body.
