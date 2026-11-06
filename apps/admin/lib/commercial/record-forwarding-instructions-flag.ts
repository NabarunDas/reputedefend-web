/**
 * Audited Admin record of forwarding instructions for one Telloya location.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not enable
 * forwarding, turn routing on, place a test call, activate Guard, change a
 * price, or send mail. 20261106003939 is applied on DEV and must not be replayed. The flag stays off.
 */
export function commercialRecordForwardingInstructionsEnabled() {
  return process.env.ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED === "true"
}
