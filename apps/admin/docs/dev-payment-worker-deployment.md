# DEV payment worker deployment

The dedicated DEV payment event worker is restricted to the `develop` Vercel Preview environment and Stripe Sandbox. Changes to the branch-scoped worker authentication setting require a new Admin deployment; a previously published deployment retains the environment snapshot captured at build time.

Review the build status and worker heartbeat before treating the payment event queue as reconciled. Do not submit another payment while previously signed events are awaiting processing.
