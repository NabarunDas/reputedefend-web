/**
 * Audited Admin Begin setup.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not call a
 * telephone provider, allocate a number, activate Guard, change a price,
 * or send mail. 20261105120000 is not applied to DEV.
 */
export function commercialBeginSetupEnabled() {
  return process.env.ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED === "true"
}
