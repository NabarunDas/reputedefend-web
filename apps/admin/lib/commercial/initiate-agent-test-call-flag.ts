/**
 * Audited Admin opening of a controlled AI receptionist web conversation.
 *
 * Exactly "true" is required together with the paid setup queue flag before
 * the page offers the command. Every other value leaves the action hidden
 * and the route does not call the provider or the database. The server
 * records the provider call id from the create response. A typed call id is
 * rejected. This flag does not place a telephone call, enable forwarding,
 * turn routing on, activate Guard, change a price, or send mail.
 * 20261106200000 was applied once to hosted DEV. Do not replay it.
 * Do not apply it to Production. The flag stays off.
 */
export function commercialInitiateAgentTestCallEnabled() {
  return process.env.ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED === "true"
}
