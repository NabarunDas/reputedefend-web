"use client"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="status-page">
      <p className="eyebrow">Something went wrong</p>
      <h1>We couldn’t load this page.</h1>
      <p>Please try again. If the problem continues, come back shortly or use another page from the menu.</p>
      <button type="button" onClick={() => reset()} className="button-primary inline-flex rounded-full bg-[var(--green)] px-5 py-3 font-bold text-white">
        Try again
      </button>
    </section>
  )
}
