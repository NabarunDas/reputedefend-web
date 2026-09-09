import Link from "next/link"
import { ArrowDown, ArrowUpRight, Check, FileSearch, FolderCheck, LockKeyhole, Plus, Route, ShieldCheck } from "lucide-react"
import { assessment, advice, evidence, process, recoveryFaqs, situations, support } from "./content"
import s from "./recovery.module.css"

function Action({ children }: { children: React.ReactNode }) {
  return <Link href="/get-help" className={s.button}>{children}<ArrowUpRight size={18} aria-hidden="true" /></Link>
}
function Heading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return <div className={s.heading}><p className={s.eyebrow}>{eyebrow}</p><h2 id={id}>{title}</h2></div>
}
export function RecoveryHero() {
  return <section className={`${s.hero} ${s.enter}`} aria-labelledby="recovery-title">
    <div><p className={s.eyebrow}>Google Business Profile Protection &amp; Recovery</p><h1 id="recovery-title">When your Business Profile is disrupted, <span>start with the facts.</span></h1><p className={s.lead}>Suspension, verification problems, access issues or unexpected restrictions can affect how customers find your business. ReputeDefend helps you understand what changed, organise the relevant evidence and prepare an appropriate recovery or appeal route.</p><div className={s.actions}><Action>Get help with my profile</Action><a href="#recovery-process" className={s.secondary}>See how recovery support works<ArrowDown size={18} aria-hidden="true" /></a></div><p className={s.note}>Independent · Evidence-led · No guaranteed reinstatement</p></div>
    <figure className={s.visual} aria-label="Our approach: profile issue, evidence review, recovery route">
      <p className={s.eyebrow}>From uncertainty to a clear next step</p>
      <div className={s.document}><div className={s.visualLabel}><FileSearch size={22} aria-hidden="true" /><span>Profile issue</span></div><p>Understand the notice.<br />Establish what changed.</p><div className={s.documentTags}><span>Notice</span><span>Timeline</span><span>Profile history</span></div></div>
      <div className={s.connector}><ArrowDown size={20} aria-hidden="true" /></div>
      <div className={s.evidenceSlip}><FolderCheck size={24} aria-hidden="true" /><div><strong>Evidence review</strong><p>Relevant. Accurate. In context.</p></div></div>
      <div className={s.connector}><ArrowDown size={20} aria-hidden="true" /></div>
      <div className={s.routeSlip}><Route size={24} aria-hidden="true" /><div><strong>Recovery route</strong><p>Prepare an appropriate next step.</p></div></div>
      <figcaption>Preparation and process support.<br />Platform decisions remain with Google.</figcaption>
    </figure>
  </section>
}
export function CommonSituations() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="situations-title"><Heading eyebrow="Recognise the situation" title="Business Profile problems can take different forms." id="situations-title" /><div className={s.scenarios}>{situations.map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
}
export function FirstAssessment() {
  return <section className={`${s.assessment} ${s.reveal}`} aria-labelledby="assessment-title"><div><Heading eyebrow="What we assess first" title="Before taking action, understand what changed." id="assessment-title" /><p className={s.muted}>Repeated speculative changes or submissions can make a situation harder to understand. A careful review helps distinguish what is known, what is missing and what may need attention.</p><p className={s.marginNote}>A clearer timeline is a better starting point than another assumption.</p></div><ol className={s.assessmentList}>{assessment.map((item, i) => <li key={item.title}><span className={s.number}>{String(i + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol></section>
}
export function PrepareEvidence() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="evidence-title"><div className={s.split}><div><Heading eyebrow="Useful information to prepare" title="Useful evidence makes a clearer case." id="evidence-title" /><p className={s.muted}>Start with what you have. The information that matters depends on the issue; not every case needs every document. Relevant, accurate records are more helpful than a large collection without context.</p></div><div className={s.evidencePanel}><div className={s.visualLabel}><FolderCheck size={22} aria-hidden="true" /><strong>Your case, in context</strong></div><ul className={s.evidenceList}>{evidence.map(item => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul><aside className={s.security}><LockKeyhole size={20} aria-hidden="true" /><div><strong>Keep your account secure</strong><p>Never send passwords, one-time codes or Google account credentials.</p></div></aside></div></div></section>
}
export function RecoverySupport() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="support-title"><div className={s.split}><div><Heading eyebrow="What we help with" title="From a confusing restriction to a structured next step." id="support-title" /><p className={s.muted}>Our Google Business Profile recovery support brings the facts, evidence and available processes together, so you can understand the next step rather than guess it.</p><div className={s.boundary}><ShieldCheck size={24} aria-hidden="true" /><p>We support preparation and process.<br /><strong>Google controls platform decisions.</strong></p></div></div><div className={s.supportList}>{support.map(item => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></div></section>
}
export function BeforeSubmitting() {
  return <section className={`${s.advisory} ${s.reveal}`} aria-labelledby="advice-title"><div><Heading eyebrow="A considered approach" title="Before you submit again, pause and check the facts." id="advice-title" /><p className={s.muted}>These are practical preparation principles, not a substitute for the instructions specific to your case. Consider the notice and relevant published guidance before acting.</p></div><ul className={s.adviceList}>{advice.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.body}</p></li>)}</ul></section>
}
export function RecoveryProcess() {
  return <section id="recovery-process" className={`${s.section} ${s.reveal}`} aria-labelledby="process-title"><Heading eyebrow="Recovery support process" title="A clear sequence. A considered next step." id="process-title" /><ol className={s.process}>{process.map((item, i) => <li key={item.title}><span className={s.step}>{String(i + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol></section>
}
export function RecoveryTransparency() {
  return <section className={`${s.trust} ${s.reveal}`} aria-labelledby="trust-title"><div className={s.trustIntro}><Heading eyebrow="Clear about our role" title="A stronger case is not the same as a guaranteed outcome." id="trust-title" /><p>Transparency is central to ReputeDefend. Google Business Profile suspension help should make the situation clearer, including the limits of what any independent service can do.</p></div><div className={s.controlGrid}><div><h3>ReputeDefend can help</h3><ul>{["Understand the issue", "Organise evidence", "Prepare clear information", "Understand relevant processes", "Support appropriate next steps"].map(text => <li key={text}><Check size={18} aria-hidden="true" />{text}</li>)}</ul></div><div><h3>ReputeDefend cannot</h3><ul>{["Guarantee reinstatement", "Override Google decisions", "Provide special access to Google", "Guarantee a specific timeframe"].map(text => <li key={text}><span className={s.dash} aria-hidden="true">—</span>{text}</li>)}</ul></div></div></section>
}
export function RecoveryFaq() {
  return <section className={`${s.faq} ${s.reveal}`} aria-labelledby="faq-title"><div><Heading eyebrow="Questions, answered" title="Clarity before you take the next step." id="faq-title" /><p className={s.muted}>Practical answers about recovery, appeals and the support we provide.</p></div><div>{recoveryFaqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus size={20} aria-hidden="true" /></summary><p>{a}</p></details>)}</div></section>
}
export function RecoveryClosing() {
  return <section className={s.closing} aria-labelledby="closing-title"><div><p className={s.eyebrow}>Start with the facts</p><h2 id="closing-title">Tell us what happened to your Business Profile.</h2><p>Share the issue, any messages you received and what you have already tried. We&apos;ll review the information and help you understand an appropriate next step.</p></div><div className={s.closingAction}><Action>Submit my Business Profile case</Action><p>No need to diagnose the problem first.<br />Start with what you know.</p></div></section>
}
