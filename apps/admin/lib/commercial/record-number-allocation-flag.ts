/**
 * Audited Admin record of an existing telephone allocation.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not buy a number,
 * turn routing on, start forwarding, place a test call, activate Guard,
 * change a price, or send mail. 20261105200000 is applied on DEV and must not be replayed. The flag stays off.
 */
export function commercialRecordNumberAllocationEnabled() {
  return process.env.ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED === "true"
}
