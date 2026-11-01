# Telloya cinematic homepage — direct implementation

The previous homepage displayed the approved console scene as a discrete rectangular image. This rewrite uses the approved console scene as a full-width landscape layer, with a mask, atmospheric CSS light layers, semantic live HTML headline/CTAs, and the rest of the homepage continuing with dark glass panels rather than abruptly switching to white.

Files:
- `apps/telloya/app/page.tsx`: complete homepage rewrite, real navigation targets, hero and product content
- `apps/telloya/app/homepage.module.css`: complete scene, responsive 320/390/768/1440 design, reduced-motion
- `apps/telloya/components/header.tsx`: centred dark-glass home navigation with approved icon; existing light header for non-home pages
- `apps/telloya/app/globals.css`: scoped header styling appended

This is marketing presentation only; no data mutations, no database/schema changes, no checkout, no fake customer statistics or testimonials.

Before merge: check Next/Vitest build, rendered browser layout in protected Vercel Preview, mobile interactions, WCAG contrast and performance. The Telloya public enquiry API remains separately gated and must not claim submissions until persisted.