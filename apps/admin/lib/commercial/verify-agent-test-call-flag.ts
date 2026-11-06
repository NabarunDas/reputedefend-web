/**
 * Audited Admin verification of a controlled AI receptionist conversation.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the database. A retrieved call is not proof
 * of a controlled staff test. A pass needs a pre-authorised intent and a
 * separate provider binding. This phase does not create that binding. This flag does not place a call,
 * enable forwarding, turn routing on, activate Guard, change a price, or
 * send mail. 20261106120000 is applied on DEV and must not be replayed. The flag stays off.
 */
export function commercialVerifyAgentTestCallEnabled() {
  return process.env.ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED === "true"
}
