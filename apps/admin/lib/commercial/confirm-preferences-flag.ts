/**
 * Audited Admin confirmation of business preferences.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not call a
 * telephone provider, allocate a number, activate Guard, change a price,
 * or send mail. 20261105144256 is applied on DEV and must not be replayed. The flag stays off.
 */
export function commercialConfirmPreferencesEnabled() {
  return process.env.ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED === "true"
}
