import { describe, expect, it, vi } from "vitest"
import { CUSTOMER_ADMIN_EMAIL, ensureCustomerAuthIdentity, type CustomerAuthAdmin } from "./identity"

const email = "alex@example.com"
const userId = "66666666-6666-4666-8666-666666666666"

function admin(overrides: Partial<CustomerAuthAdmin> = {}): CustomerAuthAdmin {
  return {
    createUser: vi.fn(),
    listUsers: vi.fn(),
    updateUserById: vi.fn(),
    ...overrides,
  }
}

describe("ensureCustomerAuthIdentity", () => {
  it("creates a confirmed identity for a new customer email", async () => {
    const api = admin({
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email, email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
        error: null,
      }),
    })
    await expect(ensureCustomerAuthIdentity(api, email)).resolves.toBe(userId)
    expect(api.createUser).toHaveBeenCalledWith({ email, email_confirm: true })
    expect(api.listUsers).not.toHaveBeenCalled()
    expect(api.updateUserById).not.toHaveBeenCalled()
  })

  it("reuses an already-confirmed identity without reconfirming", async () => {
    const api = admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } }),
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: userId, email: "Alex@Example.com", email_confirmed_at: "2026-09-18T12:00:00.000Z" }] },
        error: null,
      }),
    })
    await expect(ensureCustomerAuthIdentity(api, email)).resolves.toBe(userId)
    expect(api.updateUserById).not.toHaveBeenCalled()
  })

  it("confirms an existing unconfirmed identity for the exact email", async () => {
    const api = admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered" } }),
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ id: userId, email, email_confirmed_at: null }] },
        error: null,
      }),
      updateUserById: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email, email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
        error: null,
      }),
    })
    await expect(ensureCustomerAuthIdentity(api, email)).resolves.toBe(userId)
    expect(api.updateUserById).toHaveBeenCalledWith(userId, { email_confirm: true })
  })

  it("finds the exact user after the first list page and ignores similar emails", async () => {
    const api = admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already exists" } }),
      listUsers: vi.fn()
        .mockResolvedValueOnce({
          data: {
            users: Array.from({ length: 200 }, (_, i) => ({
              id: `page-one-${i}`,
              email: i === 0 ? "alex@example.com.attacker" : i === 1 ? "alex+otp@example.com" : `other${i}@example.com`,
              email_confirmed_at: "2026-01-01T00:00:00.000Z",
            })),
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { users: [{ id: userId, email: "ALEX@EXAMPLE.COM", email_confirmed_at: "2026-09-18T12:00:00.000Z" }] },
          error: null,
        }),
    })
    await expect(ensureCustomerAuthIdentity(api, email)).resolves.toBe(userId)
    expect(api.listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 200 })
    expect(api.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 })
  })

  it("fails closed when the user is missing after pagination is exhausted", async () => {
    const api = admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: "other", email: "sam@example.com", email_confirmed_at: "2026-01-01T00:00:00.000Z" }] }, error: null }),
    })
    await expect(ensureCustomerAuthIdentity(api, email)).resolves.toBeNull()
    expect(api.updateUserById).not.toHaveBeenCalled()
  })

  it("never creates or reconfirms the Admin account", async () => {
    const api = admin()
    await expect(ensureCustomerAuthIdentity(api, CUSTOMER_ADMIN_EMAIL)).resolves.toBeNull()
    await expect(ensureCustomerAuthIdentity(api, "Admin@ProfileRelaunch.com")).resolves.toBeNull()
    expect(api.createUser).not.toHaveBeenCalled()
    expect(api.listUsers).not.toHaveBeenCalled()
    expect(api.updateUserById).not.toHaveBeenCalled()
  })

  it("fails closed when create, lookup or confirm APIs error", async () => {
    await expect(ensureCustomerAuthIdentity(admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "service exploded" } }),
    }), email)).resolves.toBeNull()
    await expect(ensureCustomerAuthIdentity(admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already exists" } }),
      listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: "list exploded" } }),
    }), email)).resolves.toBeNull()
    await expect(ensureCustomerAuthIdentity(admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already exists" } }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: userId, email, email_confirmed_at: null }] }, error: null }),
      updateUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "update exploded" } }),
    }), email)).resolves.toBeNull()
  })

  it("rejects a created or updated user whose email does not match exactly", async () => {
    await expect(ensureCustomerAuthIdentity(admin({
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: "other@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
        error: null,
      }),
    }), email)).resolves.toBeNull()
    await expect(ensureCustomerAuthIdentity(admin({
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "already exists" } }),
      listUsers: vi.fn().mockResolvedValue({ data: { users: [{ id: userId, email, email_confirmed_at: null }] }, error: null }),
      updateUserById: vi.fn().mockResolvedValue({
        data: { user: { id: userId, email: "other@example.com", email_confirmed_at: "2026-09-28T12:00:00.000Z" } },
        error: null,
      }),
    }), email)).resolves.toBeNull()
  })
})
