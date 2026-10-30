import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external"

/**
 * Binds work to one request object. Production rendering uses Next's request
 * store. Tests can enter an explicit scope. Neither store is shared across
 * requests, and nothing here keeps account data on a process-wide map.
 */
const explicitScope = new AsyncLocalStorage<object>()

export function withAccountRequest<T>(scope: object, run: () => T): T {
  return explicitScope.run(scope, run)
}

export function currentAccountRequest(): object | null {
  const bound = explicitScope.getStore()
  if (bound) return bound
  try {
    const store = workUnitAsyncStorage.getStore()
    if (store?.type === "request") return store
  } catch {
    return null
  }
  return null
}
