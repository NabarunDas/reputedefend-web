import Link from "next/link"

export default function NotFound() {
  return <section className="panel"><h1>Page not found</h1><p>Check the address and try again.</p>
    <Link href="/login">Go to staff sign in</Link>
  </section>
}
