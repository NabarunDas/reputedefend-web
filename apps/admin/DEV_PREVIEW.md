# Stable Admin DEV webhook preview

This branch is a maintained Vercel Preview branch for the **Admin** project only.

Its deployed runtime sources originate from the reviewed `main` tree. This documentation-only file exists on `develop` to force an initial Admin Preview deployment after GitHub branch creation was optimised away as a no-op. It must not introduce a different application behaviour from Production.

Only `dev-hooks.profilerelaunch.com` is assigned to this branch, and that hostname allows only `POST /api/webhooks/stripe` in the Admin application `proxy.ts`. Cloudflare DNS, Stripe sandbox credentials and webhook registration are separate steps. No Production payments are enabled.

When moving a reviewed release to DEV for testing, keep `develop` synchronized with the reviewed `main` source changes and validate Vercel Preview/environment isolation. Avoid creating unneeded projects or continuous polling workflows.
