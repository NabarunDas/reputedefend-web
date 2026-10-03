# UX-10B — ProfileRelaunch brand continuity and Customer Portal shell

UX-10B is the visual and navigational shell for the Customer Portal. It does not add dashboard data, case lists, documents, payments, Relaunch Guard, messages, or account editing. Those arrive in later phases. The Customer Portal is not launched.

UX-10A remains the security boundary. This phase does not replace it.

## Visual source of truth

The marketing site at `profilerelaunch.com` is the design authority. The customer app does not import marketing components or runtime modules. It is independently deployable. It copies the approved assets and repeats the approved tokens in `apps/customer/app/globals.css`.

The portal is quieter than the marketing site: paper background, one horizontal navigation row, and no sales content. It is not a separate product, an Admin console, or a generic dashboard.

There is no left-hand sidebar. A sidebar would make the private workspace feel like enterprise Admin software and would disconnect it from the marketing header. Navigation stays in one horizontal row, including on small screens, where only that row scrolls.

## Brand tokens

```text
Ink / Forest    #10261F
Muted           #5D6D66
Paper           #F7F8F3
Surface         #FFFFFF
Line            #DFE5DC
Green           #0A6E3C
Green dark      #085330
Accent          #009838
Lime            #C5E8B4
Warm            #F0E8DA
Danger          #8B1E1E
```

Radii: 12px, 18px, 24px, and pill 999px. Cards use a white surface, a 1px line border, 24px radius, and the shadow `0 18px 45px rgba(16, 38, 31, 0.06)`.

`apps/customer/lib/brand.ts` holds only the customer values: the name ProfileRelaunch, the tagline "Restore visibility. Protect your reputation.", the marketing origin `https://profilerelaunch.com`, and the copied asset paths.

## Typography

Inter is the body and interface face. Manrope is the display face for headings and the portal context title. Both are loaded with `next/font/google` in `apps/customer/app/layout.tsx`, which self-hosts the files. The browser does not request Google. `font-src 'self'` stays as it is. Arial remains only as a fallback.

Page headings are Manrope 800, about 32px on small screens and 38px from tablet width up. They are not marketing hero sizes. Body copy is Inter 16px with a line-height of about 1.65.

## Asset copying and parity

These files are byte-for-byte copies of the marketing assets. They are not resized or recompressed.

```text
public/brand/profile-relaunch-logo.png
  -> apps/customer/public/brand/profile-relaunch-logo.png
public/brand/profile-relaunch-logo-light.png
  -> apps/customer/public/brand/profile-relaunch-logo-light.png
public/icon.png
  -> apps/customer/public/icon.png
public/apple-icon.png
  -> apps/customer/public/apple-icon.png
```

`apps/customer/lib/brand-assets.test.ts` compares the file bytes. Filename checks are not enough. The header and footer ask Next to serve a resized derivative through `/_next/image`. The copied source files stay exact.

The customer proxy treats those four files, `/_next/static/`, and the exact path `/_next/image` as readable without a session. It does not open `/_next/*`. Other `/brand/` files stay unavailable. This does not open `/portal`, `/case`, or any action API. Remote image hosts are not configured.

## Header and footer

`CustomerHeader` replaces the old plain text header. The logo links to `https://profilerelaunch.com` in the same tab, with the accessible name "ProfileRelaunch home". Other pages show a text link, "Back to ProfileRelaunch". `/portal` shows the non-link text "Secure customer area" instead. The header does not show an email, an identifier, or an Admin link.

The header is sticky, paper-coloured, and gains a light shadow only after scrolling. Reduced motion removes the transition and the blur.

`CustomerFooter` uses the ink background and the light logo. Its only links are ProfileRelaunch home, Contact, Privacy, and Terms, all on the marketing site, same tab. It includes the tagline, the current year, and "ProfileRelaunch is independent of Google." It has no Get Help call to action, services, pricing, resources, cookie settings, social links, or Admin link.

## Portal navigation

The information architecture is fixed:

```text
Dashboard
Cases
Documents
Payments
Relaunch Guard
Account
```

Only Dashboard is a link in this phase. It goes to `/portal` and sets `aria-current="page"`. The other destinations are non-links with `aria-disabled="true"` and the screen-reader text "not available yet". They are muted and have no href. There is no "Coming soon" label.

Future routes are not created here. `/portal/cases`, `/portal/documents`, and the rest belong to the phase that implements them. An empty route would look available and would have to be secured before it had a real purpose.

The active item uses dark green text, heavier type, and a green underline. Colour is not the only signal.

On narrow screens the page itself does not scroll sideways. The navigation row does.

## Login and sign-out

`/login` keeps the UX-10A flow, endpoints, OTP rules, and enumeration-safe copy. The presentation adds the "CUSTOMER PORTAL" eyebrow, the existing heading and explanation, and the line "Secure passwordless sign-in." The code step still uses one field, with numeric input, one-time-code autocomplete, and a six-character limit. Busy labels are "Sending code…" and "Verifying…". The control stays disabled until the request finishes.

Sign-out stays `POST /api/portal/auth/sign-out`. The button is in the portal context row. It reads "Signing out…" while the request is in progress and does not leave the page until the server confirms. Failure still shows "We couldn't sign you out. Try again." in an alert.

## Responsive and accessibility rules

Check 320, 360, 390, 768, 1024, and 1280px. At 320px the logo is about 148px wide, the return link may wrap, authentication controls can be full width, and only the portal navigation row may scroll horizontally. Ordinary secure pages are capped at 720px. Sign-in is capped at 520px. The portal container is capped at 1180px.

Skip to content remains. Interactive targets are at least about 44px. Focus uses a 3px accent outline. There is one page `h1`. "My ProfileRelaunch" is not a heading. Errors and status text keep their roles. `prefers-reduced-motion: reduce` removes smooth scrolling, transforms, and extra transitions. There is no entrance animation.

## Why there is no analytics

The authenticated customer environment stays tracking-free. The layout does not add Google Analytics, Tag Manager, Vercel Analytics, cookie consent, chat, or any other third-party script. Metadata stays `noindex`, `nofollow`, `noarchive`, with `referrer: no-referrer`. There is no Open Graph metadata. Security headers, including CSP, are unchanged.

## Feature gate and migration

`CUSTOMER_PORTAL_ENABLED` stays off. This phase does not set it in Production, Preview, or Development, and it does not add a Customer Login link to the marketing site.

Migration required: No. No Supabase object, Auth setting, or migration file changes. The migration head remains `20261003125151_customer_portal_auth_foundation_v1.sql`.
