export function TransactionLoading({ title }: { title: string }) {
  return (
    <div className="state-panel state-loading" role="status" aria-live="polite">
      <h1>{title}</h1>
      <p>This usually takes a moment.</p>
    </div>
  )
}
