import { privateResponseHeaders } from "@/lib/access"

// Defence in depth: an API request is denied even without the proxy.
function deny() {
  return Response.json({ error: "Staff sign-in is required." }, { status: 401, headers: privateResponseHeaders })
}

export { deny as GET, deny as HEAD, deny as POST, deny as PUT, deny as PATCH, deny as DELETE, deny as OPTIONS }
