"use client"

export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="panel"><h1>We couldn’t load this page</h1>
    <p>Please try again. If the problem continues, contact the workspace owner.</p>
    <button onClick={reset}>Try again</button>
  </section>
}
