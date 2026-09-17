import { requireStaff } from "@/lib/require-staff"

export default function AdminHome() {
  return requireStaff()
}
