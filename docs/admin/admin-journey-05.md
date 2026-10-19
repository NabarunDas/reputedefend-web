# ADMIN-JOURNEY-05 — assessment deployment record

The assessment commands and the guided Step 5 page are already in the Admin preview. This note records where the database change was applied.

## Deployment record

`admin_journey_05_assessment_dev_v1` has been applied **only to DEV**.

- Target: Supabase project `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`) only.
- Name: `admin_journey_05_assessment_dev_v1`.
- Source reviewed in the repository: `docs/admin/proposed-admin-journey-05-assessment.sql`.
- Production project `cxwwekdzkkjjbiyofrov` has not been changed.
- The SQL is not in `supabase/migrations`. Do not copy it there, and do not apply it a second time.

No numeric Supabase migration version is recorded here. The applied name is the name above. A later Production release has to be assessed and approved on its own.

Disposable PGlite tests may still load the proposal file on a throwaway database. That is not a second apply to DEV and it is not a Production apply.
