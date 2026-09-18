import Link from "next/link"

export default function NotFound() {
  return <section className="page"><section className="panel"><h1>Page not found</h1><p>Check the address and try again.</p>
    <Link href="/">Go to Today</Link>
  </section></section>
}
