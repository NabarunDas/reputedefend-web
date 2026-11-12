export function TelloyaAmendmentRequest({ enabled }: { enabled: boolean }) {
  return <section aria-labelledby="telloya-amendment-title">
    <h2 id="telloya-amendment-title">Request changes</h2>
    <p>A request asks the team to prepare another version. It does not change the offer you were sent and it does not take payment.</p>
    <form>
      <label htmlFor="telloya-amendment">What should change?</label>
      <textarea id="telloya-amendment" name="message" maxLength={1000} disabled={!enabled} />
      <button type="submit" disabled={!enabled}>Request changes</button>
    </form>
  </section>
}
