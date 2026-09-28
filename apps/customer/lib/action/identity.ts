import "server-only"

export const CUSTOMER_ADMIN_EMAIL = "admin@profilerelaunch.com"
const PAGE_SIZE = 200

type AuthUser = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

export type CustomerAuthAdmin = {
  createUser: (attributes: { email: string; email_confirm: boolean }) => Promise<{
    data: { user: AuthUser | null } | null
    error: { message: string } | null
  }>
  listUsers: (params: { page: number; perPage: number }) => Promise<{
    data: { users: AuthUser[] } | null
    error: { message: string } | null
  }>
  updateUserById: (id: string, attributes: { email_confirm: boolean }) => Promise<{
    data: { user: AuthUser | null } | null
    error: { message: string } | null
  }>
}

function sameEmail(left: string | null | undefined, right: string) {
  return !!left && left.toLowerCase() === right.toLowerCase()
}

function usable(user: AuthUser | null | undefined, email: string) {
  return !!user?.id && sameEmail(user.email, email)
}

async function findUserByEmail(admin: CustomerAuthAdmin, email: string) {
  for (let page = 1; ; page += 1) {
    const listed = await admin.listUsers({ page, perPage: PAGE_SIZE })
    if (listed.error || !listed.data?.users) return null
    const match = listed.data.users.find(user => sameEmail(user.email, email))
    if (match) return usable(match, email) ? match : null
    if (listed.data.users.length < PAGE_SIZE) return null
  }
}

export async function ensureCustomerAuthIdentity(admin: CustomerAuthAdmin, email: string) {
  if (!email || sameEmail(email, CUSTOMER_ADMIN_EMAIL)) return null
  try {
    const created = await admin.createUser({ email, email_confirm: true })
    if (!created.error) {
      return usable(created.data?.user, email) && created.data?.user?.email_confirmed_at ? created.data.user.id : null
    }
    if (!/already|registered|exists/i.test(created.error.message)) return null
    const existing = await findUserByEmail(admin, email)
    if (!existing) return null
    if (existing.email_confirmed_at) return existing.id
    const updated = await admin.updateUserById(existing.id, { email_confirm: true })
    if (updated.error || !usable(updated.data?.user, email) || !updated.data?.user?.email_confirmed_at) return null
    return updated.data.user.id
  } catch {
    return null
  }
}
