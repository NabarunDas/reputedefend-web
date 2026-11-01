import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Headphones,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react"
import { pageTitle } from "@/lib/brand"
import { homepageContent } from "@/lib/content"
import styles from "./homepage.module.css"

const { seo, hero, problem, howItWorks, benefits, example, audience, plans, faq, finalCta } = homepageContent

export const metadata: Metadata = {
  title: { absolute: pageTitle(seo.title) },
  description: seo.description,
  alternates: { canonical: "/" },
  openGraph: { title: seo.title, description: seo.description, url: "/" },
  twitter: { title: seo.title, description: seo.description },
}

const benefitIcons = [PhoneCall, ClipboardList, ShieldCheck, Clock3] as const
const industryIcons = [Wrench, Zap, Headphones, ShieldCheck, Sparkles] as const

/**
 * The approved console photograph is the SCENERY, not a card or a screenshot
 * standing in for the website. The accessible content and CTAs stay in HTML.
 */
function CinematicWorld() {
  return (
    <div className={styles.world} aria-hidden="true">
      <div className={styles.worldMist} />
      <div className={styles.worldHorizon} />
      <div className={styles.worldLight} />
      <div className={styles.worldLandscape}>
        <picture>
          <source media="(max-width: 639px)" srcSet="/brand/telloya-cinematic-console-mobile.webp" />
          <Image
            src="/brand/telloya-cinematic-console.webp"
            alt=""
            width={1672}
            height={604}
            priority
            sizes="100vw"
            className={styles.worldImage}
          />
        </picture>
      </div>
      <div className={styles.worldForeground} />
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.eyebrow}>{children}</p>
}

export default function Home() {
  return (
    <div className={`${styles.page} telloya-cinematic-home`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <CinematicWorld />
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}><span className={styles.eyebrowDot} /> AI receptionist · by ProfileRelaunch Ltd</div>
          <h1 id="home-title" className={styles.heroTitle}>
            <span>Your AI Receptionist</span>
            <em>Never Misses a Call</em>
          </h1>
          <p className={styles.heroSubtitle}>
            When you cannot answer, Telloya can help capture the enquiry and the details you need to follow up.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href={hero.primaryHref}>
              See how Telloya works <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
            <Link className={styles.glassCta} href={hero.secondaryHref}>
              Enquire about Telloya <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <p className={styles.previewNote}>Illustrative product preview — actual features depend on configuration</p>
        <span className={styles.heroScroll} aria-hidden="true">Discover Telloya <ChevronRight size={14} /></span>
      </section>

      <div className={styles.cinematicBody}>
        <section className={styles.valueRibbon} aria-label="Telloya at a glance">
          <div className={styles.valueRibbonTitle}><Sparkles size={18} aria-hidden="true" /> Built for busy service businesses</div>
          <div><Check size={18} aria-hidden="true" /> Missed-call assistance</div>
          <div><Check size={18} aria-hidden="true" /> Useful enquiry details</div>
          <div><Check size={18} aria-hidden="true" /> Easier follow-up</div>
        </section>

        <section className={styles.challenge} aria-labelledby="challenge-title">
          <div className={styles.challengeIntro}>
            <Eyebrow>{problem.eyebrow}</Eyebrow>
            <h2 id="challenge-title">Customers call <em>while you&apos;re working.</em></h2>
            <p>{problem.lead}</p>
          </div>
          <ol className={styles.challengeList}>
            {problem.points.map((point, index) => (
              <li key={point}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{point}</p>
              </li>
            ))}
          </ol>
          <div className={styles.callBeacon} aria-hidden="true">
            <span className={styles.beaconHalo} />
            <span className={styles.beaconPhone}><PhoneCall size={30} /></span>
            <span className={styles.beaconCaption}>Missed call <small>New enquiry</small></span>
          </div>
        </section>

        <section className={styles.process} aria-labelledby="how-title">
          <div className={styles.sectionHeader}>
            <div><Eyebrow>{howItWorks.eyebrow}</Eyebrow><h2 id="how-title">A smarter way to <em>stay in touch.</em></h2></div>
            <p>{howItWorks.lead}</p>
          </div>
          <ol className={styles.processSteps}>
            {howItWorks.steps.map((step) => (
              <li key={step.number}>
                <span className={styles.stepNum}>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
          <p className={styles.processNote}>{howItWorks.note}</p>
        </section>

        <section className={styles.benefits} aria-labelledby="benefits-title">
          <div className={styles.sectionHeader}>
            <div><Eyebrow>Why Telloya</Eyebrow><h2 id="benefits-title">More than just <em>call answering.</em></h2></div>
            <p>{benefits.title}</p>
          </div>
          <div className={styles.benefitGrid}>
            {benefits.items.map((item, index) => {
              const Icon = benefitIcons[index] ?? Sparkles
              return (
                <article key={item.title} className={styles.benefitCard}>
                  <span className={styles.benefitIcon}><Icon size={25} strokeWidth={1.7} aria-hidden="true" /></span>
                  <h3>{item.title}</h3><p>{item.description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className={styles.example} aria-labelledby="example-title">
          <div className={styles.exampleCopy}>
            <Eyebrow>{example.eyebrow}</Eyebrow>
            <h2 id="example-title">From an unanswered call to <em>a useful conversation.</em></h2>
            <p>{example.lead}</p>
            <Link href="/features" className={styles.textLink}>Explore what Telloya can capture <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className={styles.leadCard}>
            <div className={styles.leadTop}><span><span className={styles.liveDot} /> Example enquiry</span><span>{example.card.time}</span></div>
            <div className={styles.leadName}><span className={styles.leadAvatar}><PhoneCall size={22} aria-hidden="true" /></span><div><strong>{example.card.caller}</strong><small>{example.card.service}</small></div></div>
            <dl>
              <div><dt>Location</dt><dd>{example.card.location}</dd></div>
              <div><dt>Enquiry</dt><dd>{example.card.problem}</dd></div>
              <div><dt>Callback</dt><dd>{example.card.callback}</dd></div>
            </dl>
            <p className={styles.exampleDisclaimer}>Illustrative example only — not a real customer record.</p>
          </div>
        </section>

        <section className={styles.industries} aria-labelledby="industries-title">
          <div className={styles.sectionHeader}>
            <div><Eyebrow>{audience.title}</Eyebrow><h2 id="industries-title">Built for <em>service businesses.</em></h2></div>
            <p>{audience.lead}</p>
          </div>
          <div className={styles.industryGrid}>
            {audience.industries.map((industry, index) => {
              const Icon = industryIcons[index] ?? Wrench
              return <Link href="/industries" className={styles.industryTile} key={industry}>
                <span className={styles.industryArt}><Icon size={44} strokeWidth={1.2} aria-hidden="true" /></span>
                <span className={styles.industryLabel}>{industry}<ArrowUpRight size={17} aria-hidden="true" /></span>
              </Link>
            })}
          </div>
        </section>

        <section className={styles.plans} aria-labelledby="plans-title">
          <div className={styles.sectionHeader}>
            <div><Eyebrow>{plans.eyebrow}</Eyebrow><h2 id="plans-title">Find the right <em>fit for your business.</em></h2></div>
            <p>{plans.lead}</p>
          </div>
          <div className={styles.planGrid}>
            {[plans.telloya, plans.complete].map((plan) => (
              <article className={styles.planCard} key={plan.name}>
                <h3>{plan.name}</h3><p>{plan.description}</p>
                <ul>{plan.features.map(f => <li key={f}><Check size={17} aria-hidden="true" />{f}</li>)}</ul>
                {"note" in plan && <p className={styles.planNote}>{plan.note}</p>}
                <Link href={plan.href}>Explore {plan.name} <ArrowRight size={17} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div><Eyebrow>{faq.eyebrow}</Eyebrow><h2 id="faq-title">Good questions. <em>Clear answers.</em></h2></div>
          <div className={styles.faqList}>{faq.questions.map(({ q, a }) => (
            <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>
          ))}</div>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title">
          <div className={styles.finalGlow} aria-hidden="true" />
          <div className={styles.finalCopy}><Eyebrow>A better first impression</Eyebrow><h2 id="final-title">See how Telloya can <em>work for your business.</em></h2><p>{finalCta.title}</p></div>
          <Link href={finalCta.href} className={styles.primaryCta}>{finalCta.cta}<ArrowUpRight size={19} aria-hidden="true" /></Link>
        </section>
      </div>
    </div>
  )
}