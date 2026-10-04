/**
 * Classification of every Customer Portal page and API.
 *
 * This module is not an authorisation engine. `proxy.ts` and each loader or
 * route handler decide access themselves. The inventory exists so a new portal
 * route cannot ship until someone records what it is allowed to do.
 */

export type PortalProxyClass = "login" | "portal-page" | "pre-auth" | "sign-out" | "session-mutation" | "session-read"

export type PortalRoute = {
  path: string
  file: string
  kind: "page" | "api"
  methods: readonly ("GET" | "HEAD" | "POST")[]
  audience: "public" | "portal-customer"
  gate: "CUSTOMER_PORTAL_ENABLED"
  session: "none" | "portal"
  origin: "none" | "matching-origin-and-json" | "request-origin"
  contentType: "none" | "application/json"
  effect: "read" | "mutation"
  authority: string
  unauthenticated: string
  proxyClass: PortalProxyClass
}

export const PORTAL_ROUTES: readonly PortalRoute[] = [
  {
    path: "/login",
    file: "app/login/page.tsx",
    kind: "page",
    methods: ["GET", "HEAD"],
    audience: "public",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "none",
    origin: "none",
    contentType: "none",
    effect: "read",
    authority: "No customer record. The page renders the sign-in form only when portalAvailable() is true.",
    unauthenticated: "With the gate on, the sign-in form is shown. With the gate off, the proxy redirects to / and the page itself does not render the form.",
    proxyClass: "login",
  },
  ...[
    ["/", "app/portal/page.tsx", "loadCustomerDashboard"],
    ["/cases", "app/portal/cases/page.tsx", "loadCustomerCases"],
    ["/cases/[reference]", "app/portal/cases/[reference]/page.tsx", "loadCustomerCase"],
    ["/documents", "app/portal/documents/page.tsx", "loadCustomerDocuments"],
    ["/cases/[reference]/documents", "app/portal/cases/[reference]/documents/page.tsx", "loadCustomerCaseDocuments"],
    ["/cases/[reference]/service", "app/portal/cases/[reference]/service/page.tsx", "loadCustomerCaseService"],
    ["/payments", "app/portal/payments/page.tsx", "loadCustomerPayments"],
    ["/cases/[reference]/payments", "app/portal/cases/[reference]/payments/page.tsx", "loadCustomerCasePayments"],
    ["/guard", "app/portal/guard/page.tsx", "loadCustomerGuard"],
    ["/guard/[selector]", "app/portal/guard/[selector]/page.tsx", "loadCustomerGuardLocation"],
    ["/messages", "app/portal/messages/page.tsx", "loadCustomerMessages"],
    ["/messages/[selector]", "app/portal/messages/[selector]/page.tsx", "loadCustomerMessage"],
    ["/account", "app/portal/account/page.tsx", "loadCustomerAccount"],
  ].map(([suffix, file, loader]): PortalRoute => ({
    path: `/portal${suffix === "/" ? "" : suffix}`,
    file,
    kind: "page",
    methods: ["GET", "HEAD"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "none",
    contentType: "none",
    effect: "read",
    authority: `${loader} re-reads the portal session and returns only that customer's rows. The layout is not the boundary.`,
    unauthenticated: "Gate off redirects to /. Gate on without a portal session redirects to /login. An action session is not accepted.",
    proxyClass: "portal-page",
  })),
  ...["start", "resend", "verify"].map((name): PortalRoute => ({
    path: `/api/portal/auth/${name}`,
    file: `app/api/portal/auth/${name}/route.ts`,
    kind: "api",
    methods: ["POST"],
    audience: "public",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "none",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "lib/portal/http.ts checks the gate, origin, and content type, then calls the existing portal login RPCs. It does not create a portal session until verify succeeds.",
    unauthenticated: "The proxy allows POST through so the handler can refuse. The handler returns 404 when the gate is off and does not call a provider.",
    proxyClass: "pre-auth",
  })),
  {
    path: "/api/portal/auth/sign-out",
    file: "app/api/portal/auth/sign-out/route.ts",
    kind: "api",
    methods: ["POST"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "signOutPortal revokes only the current portal token via customer_portal_sign_out_v1 and clears portal cookies. It does not touch an action session.",
    unauthenticated: "POST is allowed through the proxy so an expired cookie can still be cleared. The handler returns 404 when the gate is off and does not set a portal cookie.",
    proxyClass: "sign-out",
  },
  {
    path: "/api/portal/evidence",
    file: "app/api/portal/evidence/route.ts",
    kind: "api",
    methods: ["POST"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "portalEvidenceUpload re-checks the gate, origin, content type, and portal session, then calls the existing evidence RPCs for an owned case.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-mutation",
  },
  {
    path: "/api/portal/service",
    file: "app/api/portal/service/route.ts",
    kind: "api",
    methods: ["POST"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "portalServiceCommand re-checks the gate, origin, content type, and portal session, then calls the same private service helper as the secure link.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-mutation",
  },
  {
    path: "/api/portal/payments",
    file: "app/api/portal/payments/route.ts",
    kind: "api",
    methods: ["POST"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "portalPaymentCommand re-checks the gate, origin, content type, and portal session, then calls the same private payment helper as the secure link.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-mutation",
  },
  {
    path: "/api/portal/guard",
    file: "app/api/portal/guard/route.ts",
    kind: "api",
    methods: ["POST"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "matching-origin-and-json",
    contentType: "application/json",
    effect: "mutation",
    authority: "portalGuardCommand re-checks the gate, origin, content type, and portal session, then calls the same private Guard helpers as the secure link.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-mutation",
  },
  {
    path: "/api/portal/documents/download",
    file: "app/api/portal/documents/download/route.ts",
    kind: "api",
    methods: ["GET"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "request-origin",
    contentType: "none",
    effect: "read",
    authority: "portalDocumentDownload re-checks the gate, request origin, and portal session, then resolves an owned published document. The response does not include the storage key.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-read",
  },
  {
    path: "/api/portal/payments/receipt",
    file: "app/api/portal/payments/receipt/route.ts",
    kind: "api",
    methods: ["GET"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "request-origin",
    contentType: "none",
    effect: "read",
    authority: "portalReceiptDownload re-checks the gate, request origin, and portal session, then reads the owned receipt through customer_portal_receipt_v1.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-read",
  },
  {
    path: "/api/portal/payments/invoice",
    file: "app/api/portal/payments/invoice/route.ts",
    kind: "api",
    methods: ["GET"],
    audience: "portal-customer",
    gate: "CUSTOMER_PORTAL_ENABLED",
    session: "portal",
    origin: "request-origin",
    contentType: "none",
    effect: "read",
    authority: "portalInvoiceOpen re-checks the gate, request origin, and portal session, then resolves an owned issued invoice. A guessed selector is not found.",
    unauthenticated: "Gate off is 404. Gate on without a portal session is 401. An action session is not accepted.",
    proxyClass: "session-read",
  },
]

export const PORTAL_NAV_HREFS = [
  "/portal",
  "/portal/cases",
  "/portal/documents",
  "/portal/payments",
  "/portal/guard",
  "/portal/messages",
  "/portal/account",
] as const
