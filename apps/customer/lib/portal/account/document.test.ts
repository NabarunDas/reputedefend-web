import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { authenticatedDocumentPath, replaceAuthenticatedDocument } from "./document"

describe("authenticated document boundary", () => {
  it("replaces the current document with the portal or the login page", () => {
    const navigate = vi.fn()
    replaceAuthenticatedDocument("portal", navigate)
    replaceAuthenticatedDocument("login", navigate)
    expect(authenticatedDocumentPath("portal")).toBe("/portal")
    expect(authenticatedDocumentPath("login")).toBe("/login")
    expect(navigate.mock.calls).toEqual([["/portal"], ["/login"]])
  })

  it("keeps identity on the server document instead of the client router or storage", () => {
    const documentSource = readFileSync(join(process.cwd(), "lib/portal/account/document.ts"), "utf8")
    const login = readFileSync(join(process.cwd(), "app/login/login-client.tsx"), "utf8")
    const signOut = readFileSync(join(process.cwd(), "app/portal/sign-out-button.tsx"), "utf8")
    const header = readFileSync(join(process.cwd(), "components/customer-header.tsx"), "utf8")
    const navigation = readFileSync(join(process.cwd(), "app/portal/portal-nav.tsx"), "utf8")
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8")

    expect(documentSource).toContain("window.location.replace(path)")
    expect(documentSource).toContain("window.location.reload()")
    expect(documentSource).not.toMatch(/localStorage|sessionStorage|router/)
    expect(login).toContain('replaceAuthenticatedDocument("portal")')
    expect(login).not.toMatch(/router\.(push|replace)|localStorage|sessionStorage/)
    expect(signOut).toContain('replaceAuthenticatedDocument("login")')
    expect(signOut).not.toMatch(/router\.(push|replace)|localStorage|sessionStorage/)
    expect(header).toContain("reloadAuthenticatedDocument()")
    expect(header).not.toMatch(/localStorage|sessionStorage/)
    expect(header).toContain('accountName ?? "My account"')
    expect(navigation).toContain("href={item.href}")
    expect(navigation).not.toMatch(/next\/link|router\.(push|replace)/)
    expect(layout).toContain("loadPortalHeaderName()")
  })
})
