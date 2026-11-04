import { afterAll } from "vitest"

// React 19 flushes passive effects on a later task and reads `window` while
// doing so. Drain those tasks before Vitest tears the jsdom environment down,
// or the suite exits with an unhandled ReferenceError after the tests pass.
afterAll(async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
})
