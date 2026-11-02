# Telloya — approved cinematic brand assets (2026-11-01)

The Telloya owner approved the exact emerald-glass handset + sparkle logo and cinematic forest-green call-console scene. These are actual optimized image files, committed to this branch by ChatGPT. Preserve them; do not regenerate or substitute artwork.

| File | Dimensions | Intended use |
|---|---:|---|
| `telloya-logo-approved.webp` | 1961 × 580, RGBA | Approved full lockup; **use on light backgrounds only**: its dark wordmark is low-contrast over the dark hero. |
| `telloya-mark-approved.webp` | 697 × 697, RGBA | Approved glass phone/sparkle/orbit emblem; dark header alongside accessible ivory HTML “Telloya” text. |
| `telloya-cinematic-console.webp` | 1672 × 604 | Cropped console illustration, desktop hero. |
| `telloya-cinematic-console-mobile.webp` | 925 × 604 | Responsive console illustration, mobile hero. |
| `telloya-cinematic-approved.webp` | 1672 × 941 | Complete owner-approved composition / art-direction reference only. **Contains baked-in heading and CTA; do not use as the entire homepage.** |
| `telloya-icon-32.png` | 32 × 32 | Favicon |
| `telloya-icon-180.png` | 180 × 180 | Apple touch icon |
| `telloya-icon-192.png` | 192 × 192 | PWA icon |
| `telloya-icon-512.png` | 512 × 512 | PWA icon |

All images are optimizer-produced derivatives of the owner-approved source, not unapproved replacements. Nine image blobs were verified by exact Git blob SHA against the local originals.

### Implementation requirements

- Keep the actual hero heading, introductory copy, and CTA buttons as DOM elements with working links; use `console.webp` as **illustrative** backdrop/graphic, not a baked-in fake UI.
- Retain the contrast-safe readable site name on dark surfaces and light background for the full approved lockup.
- Progressive image delivery through `next/image` / correct `sizes`, no layout shift; responsive `<picture>` if necessary.
- Subtle glassmorphism, immersive forest-green/emerald gradient/mist, restrained lime-glow buttons; reduced-motion, keyboard focus, high contrast, responsive 320–1440px.
- Never describe imagery as a live dashboard or operational customer call record. Label as illustrative.
- These are **marketing-only assets**; no DB/API, Supabase, Stripe, DNS or Production changes needed.

PR #389's enquiry endpoint **currently returns random mock `TY-...` success without persistence**; do not allow it to deploy until it fails closed or genuinely saves a record through a separately approved backend migration.