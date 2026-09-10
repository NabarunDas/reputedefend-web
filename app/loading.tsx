export default function Loading() {
  return (
    <div className="status-page" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Loading</p>
      <h1 className="section-title">Preparing the next step</h1>
      <div className="mt-6 h-2 max-w-sm rounded-full bg-[var(--line)]" />
      <p>This should only take a moment.</p>
    </div>
  )
}
