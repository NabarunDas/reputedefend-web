/**
 * Audited Admin record of an operator-attested AI configuration.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not call a
 * telephone provider, allocate a number, activate Guard, change a price,
 * or send mail. 20261105172055 is not applied to DEV.
 */
export function commercialConfirmAiConfigurationEnabled() {
  return process.env.ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED === "true"
}
