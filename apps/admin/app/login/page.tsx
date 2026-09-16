export default function StaffLogin() {
  return <section className="panel" aria-labelledby="login-title">
    <p className="eyebrow">ProfileRelaunch Admin</p>
    <h1 id="login-title">Staff sign in</h1>
    <p>Use your approved work email. We’ll send you a one-time code.</p>
    <div className="notice" role="status">
      <h2>Sign-in is not available yet</h2>
      <p>Staff access is being set up. Please check with the workspace owner before signing in.</p>
    </div>
    <p className="muted">This workspace is for authorised staff.</p>
  </section>
}
