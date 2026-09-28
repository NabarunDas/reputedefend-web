import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
function deny() {
  return Response.json({ message: ACTION_UNAVAILABLE }, { status: 401, headers: privateResponseHeaders })
}
export { deny as GET, deny as HEAD, deny as POST, deny as PUT, deny as PATCH, deny as DELETE, deny as OPTIONS }
