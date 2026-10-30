export type AuthenticatedDocument = "portal" | "login"

const paths = {
  portal: "/portal",
  login: "/login",
} as const

export function authenticatedDocumentPath(target: AuthenticatedDocument): string {
  return paths[target]
}

/**
 * The root layout is shared by the login page and the portal. A client-side
 * navigation keeps the layout from the previous request, so the header would
 * keep a missing name or the previous customer's name. Replacing the document
 * loads `customer_portal_account_v1` for the current session and drops this
 * history entry. `navigate` is the browser default; tests can observe the path.
 */
export function replaceAuthenticatedDocument(
  target: AuthenticatedDocument,
  navigate: (path: string) => void = defaultNavigate,
) {
  navigate(authenticatedDocumentPath(target))
}

/** A back-forward cache restore can paint a document from another session. */
export function reloadAuthenticatedDocument(reload: () => void = defaultReload) {
  reload()
}

function defaultNavigate(path: string) {
  window.location.replace(path)
}

function defaultReload() {
  window.location.reload()
}
