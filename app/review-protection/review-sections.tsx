import Link from "next/link"
import { ArrowDown, ArrowDownRight, ArrowUpRight, Check, FileText, LockKeyhole, MessageSquare, Plus, Scale, Search } from "lucide-react"
import { assessmentAreas, evidenceItems, precautions, reviewFaqs, reviewProcess, scenarios, supportAreas } from "./content"
import s from "./review.module.css"

function AssessmentLink({ closing = false }: { closing?: boolean }) {
  return <Link href="/get-help" className={`${s.button} ${closing ? s.limeButton : ""}`}>Request a review assessment <ArrowUpRight aria-hidden="true" size={18} /></Link>
}

export function ReviewHero() {
  const visual = [
    { title: "Review", text: "What does it actually say?", Icon: MessageSquare },
    { title: "Evidence", text: "What can be supported?", Icon: FileText },
    { title: "Policy assessment", text: "Is there a reasonable concern?", Icon: Scale },
    { title: "Appropriate action", text: "Choose a proportionate response.", Icon: ArrowDownRight },
  ]
  return <section className={`${s.hero} ${s.enter}`} aria-labelledby="review-title">
    <div><p className={s.eyebrow}>Google review protection</p><h1 id="review-title">Protect your reputation <span>without making promises the evidence cannot support.</span></h1><p className={s.lead}>A damaging review can feel urgent, but the right response starts with understanding what actually happened. ReputeDefend helps assess suspicious or potentially policy-violating reviews, organise relevant evidence and support an appropriate reporting or challenge process.</p><div className={s.actions}><AssessmentLink /><Link className={s.textLink} href="#review-process">See how review protection works <ArrowDown aria-hidden="true" size={18} /></Link></div><p className={s.trustLine}>Independent • Policy-aware • No guaranteed removal</p></div>
    <figure className={s.visual}><div className={s.visualHeading}><span className={s.eyebrow}>A considered route</span><Scale size={24} aria-hidden="true" /></div><ol>{visual.map(({ title, text, Icon }) => <li key={title}><span className={s.visualIcon}><Icon size={20} aria-hidden="true" /></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ol><figcaption>A clear concern. A relevant record.<br />An action the facts can support.</figcaption></figure>
  </section>
}

export function ReviewDistinction() {
  return <section className={`${s.distinction} ${s.reveal}`} aria-labelledby="distinction-title"><div><p className={s.eyebrow}>An important distinction</p><h2 id="distinction-title">A bad review is not automatically a policy violation.</h2></div><div className={s.distinctionBody}><p className={s.statement}>Not every negative review can — or should — be removed.</p><p>Legitimate criticism may remain even when it is uncomfortable. Disagreeing with a review does not, on its own, make it a policy concern.</p><p>Policy-based reporting should be based on the content and context, not simply the rating. The first step is to understand what can actually be supported by facts.</p><strong>Assess the concern. Not just the impact.</strong></div></section>
}

export function ReviewScenarios() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="scenarios-title"><div className={s.splitIntro}><div><p className={s.eyebrow}>When to look more closely</p><h2 id="scenarios-title">Some review situations deserve a closer look.</h2></div><p>These situations may warrant assessment. They are not automatic violations, and none establishes that a review must be removed.</p></div><dl className={s.scenarios}>{scenarios.map(([title, text]) => <div key={title}><dt>{title}</dt><dd>{text}</dd></div>)}</dl></section>
}

export function ReviewAssessment() {
  return <section className={`${s.section} ${s.framework} ${s.reveal}`} aria-labelledby="assessment-title"><div><p className={s.eyebrow}>What we assess</p><h2 id="assessment-title">A clear framework.<br />A proportionate view.</h2><p className={s.intro}>Google review policy assessment starts with what is observable, considers what is uncertain and keeps the response proportionate to the evidence.</p><p className={s.marginNote}>A reasonable concern is a starting point for assessment, not a promise of removal.</p></div><ol className={s.assessmentList}>{assessmentAreas.map((item, index) => <li key={item.title}><span className={s.number}>{String(index + 1).padStart(2, "0")}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></li>)}</ol></section>
}

export function ReviewEvidence() {
  return <section className={`${s.evidence} ${s.reveal}`} aria-labelledby="evidence-title"><div><p className={s.eyebrow}>Useful evidence</p><h2 id="evidence-title">Good review protection starts with a clear record.</h2><p className={s.intro}>A concise account with relevant supporting information is more useful than a large, unfocused collection of files. Start with what you know; make uncertainties clear.</p><div className={s.security}><LockKeyhole aria-hidden="true" size={20} /><p><strong>Keep the information proportionate.</strong><br />Share only information that is relevant. Do not send passwords, account credentials or unnecessary personal data.</p></div></div><div className={s.evidenceRecord}><h3>A useful starting record</h3><ul>{evidenceItems.map(item => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul><p>Not every case requires every type of evidence. Include only what is relevant, lawful and appropriate to share.</p></div></section>
}

export function ReviewSupport() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="support-title"><div className={s.splitIntro}><div><p className={s.eyebrow}>How we help</p><h2 id="support-title">A policy-based challenge should be built on facts, not frustration.</h2></div><p>We help businesses understand whether and how to report problematic Google reviews through an appropriate route. We support the process; Google decides whether a review is removed.</p></div><dl className={s.supportList}>{supportAreas.map(([title, text]) => <div key={title}><dt>{title}</dt><dd>{text}</dd></div>)}</dl></section>
}

export function ReviewPathways() {
  const paths = [
    { title: "Respond", cue: "A genuine experience", Icon: MessageSquare, text: "When a legitimate review may benefit from a calm, professional public response.", action: "Acknowledge the concern. Explain what is helpful. Keep private information private.", note: "Criticism can be valid, even when it is difficult." },
    { title: "Assess & report", cue: "A supported policy concern", Icon: Scale, text: "When there appears to be a reasonable policy concern supported by relevant evidence.", action: "Check the context. Organise the record. Use an appropriate reporting or challenge route.", note: "A report is a request for assessment, not a guarantee." },
    { title: "Document & monitor", cue: "An incomplete picture", Icon: Search, text: "When the situation is unclear and gathering context may be more appropriate than reacting immediately.", action: "Keep a dated record. Note what is unknown. Reassess if relevant information emerges.", note: "A considered pause can be the right response." },
  ]
  return <section id="review-pathways" className={`${s.pathways} ${s.reveal}`} aria-labelledby="pathways-title"><header><p className={s.eyebrow}>Respond, report or leave alone?</p><h2 id="pathways-title">Not every review needs the same response.</h2><p>Let the facts determine the route — not the pressure to react.</p></header><div className={s.routeOrigin}><span>What does the evidence support?</span></div><div className={s.routeGrid}>{paths.map(({ title, cue, Icon, text, action, note }, index) => <article key={title} className={`${s.route} ${index === 1 ? s.policyRoute : ""}`}><div className={s.routeCue}><Icon size={22} aria-hidden="true" /><span>{cue}</span></div><h3>{title}</h3><p className={s.routeDescription}>{text}</p><div className={s.routeAction}><span>Appropriate next step</span><p>{action}</p></div><p className={s.routeNote}>{note}</p></article>)}</div><p className={s.pathwayNote}>General guidance, not a definitive policy or legal determination. The appropriate route depends on the particular facts; taking no further action may also be reasonable.</p></section>
}

export function ReviewPrecautions() {
  return <section className={`${s.section} ${s.reveal}`} aria-labelledby="precautions-title"><div className={s.splitIntro}><div><p className={s.eyebrow}>What not to do</p><h2 id="precautions-title">Protect the business while you protect the reputation.</h2></div><p>A measured approach helps avoid making an already difficult situation more complicated. These are practical precautions, not a substitute for case-specific advice.</p></div><dl className={s.precautions}>{precautions.map(([title, text]) => <div key={title}><dt>{title}</dt><dd>{text}</dd></div>)}</dl></section>
}

export function ReviewProcess() {
  return <section id="review-process" className={`${s.section} ${s.processSection} ${s.reveal}`} aria-labelledby="process-title"><div><p className={s.eyebrow}>The review protection process</p><h2 id="process-title">From an initial concern to a considered next step.</h2><p className={s.intro}>A deliberate sequence, with room to change direction when the facts call for it.</p><Link className={s.textLink} href="#review-pathways">Explore the three response routes <ArrowUpRight size={18} aria-hidden="true" /></Link></div><ol className={s.process}>{reviewProcess.map(([title, text], index) => <li key={title}><span className={s.number}>{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{text}</p></div><ArrowDownRight aria-hidden="true" size={20} /></li>)}</ol></section>
}

export function ReviewExpectations() {
  const can = ["Assess the review and context", "Organise relevant evidence", "Identify potential policy concerns", "Support reporting or challenge preparation", "Explain realistic next steps"]
  const cannot = ["Guarantee review removal", "Remove reviews directly", "Override Google decisions", "Guarantee a decision timeframe", "Turn legitimate criticism into a policy violation"]
  return <section className={`${s.expectations} ${s.reveal}`} aria-labelledby="expectations-title"><p className={s.eyebrow}>Clear expectations</p><h2 id="expectations-title">We help build the strongest appropriate case. <span>We do not promise removal.</span></h2><div className={s.boundaries}><div><h3>ReputeDefend can help</h3><ul>{can.map(text => <li key={text}><Check size={18} aria-hidden="true" />{text}</li>)}</ul></div><div><h3>ReputeDefend cannot</h3><ul>{cannot.map(text => <li key={text}><span aria-hidden="true">—</span>{text}</li>)}</ul></div></div><div className={s.principles}><p>Evidence over promises.</p><p>Fairness over reaction.</p><p>Transparency over certainty.</p></div></section>
}

export function ReviewFaq() {
  return <section className={`${s.section} ${s.faq} ${s.reveal}`} aria-labelledby="faq-title"><div><p className={s.eyebrow}>Questions, answered</p><h2 id="faq-title">A clearer view of review protection.</h2><p className={s.intro}>Useful context before you decide what to do next.</p></div><div>{reviewFaqs.map(({ q, a }) => <details key={q}><summary>{q}<Plus aria-hidden="true" size={20} /></summary><p>{a}</p></details>)}</div></section>
}

export function ReviewClosing() {
  return <section className={`${s.closing} ${s.reveal}`} aria-labelledby="closing-title"><div><p className={s.eyebrow}>Start with the review</p><h2 id="closing-title">Concerned about a review? Start with the facts.</h2><p>Share the review, the context and what concerns you. We&apos;ll assess the information and help you understand whether an appropriate reporting, challenge or response route may be available.</p></div><div className={s.closingAction}><AssessmentLink closing /><p>A relevant record is a better starting point than a promise.</p></div></section>
}
