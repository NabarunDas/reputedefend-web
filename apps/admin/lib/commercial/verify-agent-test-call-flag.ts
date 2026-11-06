/**
 * Audited Admin verification of a controlled AI receptionist conversation.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. This flag does not place a call,
 * enable forwarding, turn routing on, activate Guard, change a price, or
 * send mail. 20261106120000 must not be applied to hosted DEV.
 */
export function commercialVerifyAgentTestCallEnabled() {
  return process.env.ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED === "true"
}
