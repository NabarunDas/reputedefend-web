import { type GoogleBusinessProfileEnv, googleLiveConfiguration } from "./config"
import type { GoogleTransport } from "./google-adapter"
import type { GoogleTokenExchange } from "./oauth"

// Everything an executable Google connection needs: somewhere to send the
// authorization code and something to carry the resulting API calls.
export type GoogleLiveStack = {
  transport: GoogleTransport
  exchange: GoogleTokenExchange
}

// Step 21 ships the integration boundary, not an executable connection. There
// is no token exchange and no transport in this build, so this is null.
//
// This is deliberately a code fact rather than a configuration one. No
// environment variable, request header or request body can change it, so a
// fully configured production deployment still cannot begin an OAuth flow.
// Activating the flow means shipping an implementation here, which is a code
// change that has to be written and reviewed, not a setting someone can flip.
export const googleLiveStack: GoogleLiveStack | null = null

export function googleConnectionExecutionAvailable(
  stack: GoogleLiveStack | null = googleLiveStack,
): boolean {
  return stack !== null
}

// The blocker code reported while no implementation exists. Unlike the
// configuration blockers it cannot be cleared by setting anything.
export const connectionNotImplemented = "connection_not_implemented"

export type ConnectExecution = {
  available: boolean
  blockers: string[]
}

// The complete answer to "may this build start a Google connection?". Both
// halves must pass: every configured value must be present, and an
// implementation of the live stack must exist in the running code.
export function googleConnectExecution(
  env: GoogleBusinessProfileEnv = process.env,
  stack: GoogleLiveStack | null = googleLiveStack,
): ConnectExecution {
  const blockers = [...googleLiveConfiguration(env).blockers]
  if (!googleConnectionExecutionAvailable(stack)) blockers.push(connectionNotImplemented)
  return { available: blockers.length === 0, blockers }
}
