export default function MessageLoading() {
  return (
    <div className="messages-page state-panel state-loading" role="status" aria-live="polite">
      <h1>Loading this message</h1>
      <p>This usually takes a moment.</p>
    </div>
  )
}
