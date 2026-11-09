import type { Metadata } from "next"
import Link from "next/link"
import { getImageProps } from "next/image"
import { preload } from "react-dom"
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
import { absolutePageTitle, pageSocialMetadata } from "@/lib/brand"
import { homepageContent } from "@/lib/content"
import styles from "./homepage.module.css"

const { seo, hero, problem, howItWorks, benefits, example, audience, plans, faq, finalCta } = homepageContent

export const metadata: Metadata = {
  title: absolutePageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/" },
  ...pageSocialMetadata({ title: seo.title, description: seo.description, path: "/" }),
}

const benefitIcons = [PhoneCall, ClipboardList, ShieldCheck, Clock3] as const
const industryIcons = [Wrench, Zap, Headphones, ShieldCheck, Sparkles] as const

/**
 * The approved console photograph is the SCENERY, not a card or a screenshot
 * standing in for the website. The accessible content and CTAs stay in HTML.
 */
const mobileConsoleSrc = "/brand/telloya-cinematic-console-mobile.webp"
const mobileConsoleMedia = "(max-width: 639px)"
const desktopConsoleMedia = "(min-width: 640px)"

function CinematicWorld() {
  const { props: desktopConsole } = getImageProps({
    src: "/brand/telloya-cinematic-console.webp",
    alt: "",
    width: 1672,
    height: 604,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
  })
  // The approved mobile file is the LCP image below 640px. Preload that exact
  // file there, and keep the desktop derivative preload on wider screens so
  // the two requests do not compete.
  preload(mobileConsoleSrc, {
    as: "image",
    fetchPriority: "high",
    media: mobileConsoleMedia,
  })
  preload(desktopConsole.src, {
    as: "image",
    imageSrcSet: desktopConsole.srcSet,
    imageSizes: desktopConsole.sizes,
    fetchPriority: "high",
    media: desktopConsoleMedia,
  })

  return (
    <div className={styles.world} aria-hidden="true">
      <div className={styles.worldMist} />
      <div className={styles.worldHorizon} />
      <div className={styles.worldLight} />
      <div className={styles.worldLandscape}>
        <picture>
          <source media={mobileConsoleMedia} srcSet={mobileConsoleSrc} />
          <img {...desktopConsole} className={styles.worldImage} alt="" />
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
          <div className={styles.heroEyebrow}><span className={styles.eyebrowDot} /> {hero.eyebrow}</div>
          <h1 id="home-title" className={styles.heroTitle}>
            <span>{hero.headlineLead}</span>
            <em>{hero.headlineEmphasis}</em>
          </h1>
          <p className={styles.heroSubtitle}>{hero.supporting}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href={hero.primaryHref}>
              {hero.primaryCta} <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
            <Link className={styles.glassCta} href={hero.secondaryHref}>
              {hero.secondaryCta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
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
            <div className={styles.exampleLinks}>
              <Link href="/features" className={styles.textLink}>Explore what Telloya can capture <ArrowUpRight size={17} aria-hidden="true" /></Link>
              <Link href={example.demoLink.href} className={styles.textLink}>{example.demoLink.label} <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </div>
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
            <div><Eyebrow>{plans.eyebrow}</Eyebrow><h2 id="plans-title">Four plans <em>to fit your needs.</em></h2></div>
            <p>{plans.lead}</p>
          </div>
          <div className={styles.planGrid}>
            {plans.tiers.map((tier) => (
              <article className={`${styles.planCard} ${tier.popular ? styles.popularCard : ""}`} key={tier.name}>
                {tier.popular && <div className={styles.popularLabel}>Recommended</div>}
                <div className={styles.planPricing}>
                  <div className={styles.planPrice}>
                    {tier.price}
                    {tier.pricePeriod ? <span className={styles.planPricePeriod}>{tier.pricePeriod}</span> : null}
                  </div>
                  <div className={styles.planMinutes}>{tier.minutes}</div>
                </div>
                <h3>{tier.name}</h3>
                <p>{tier.description}</p>
                <Link href={tier.href} className={styles.planLink}>View pricing <ArrowRight size={17} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
          <div className={styles.planGuard}>
            <div className={styles.planGuardContent}>
              <h3>{plans.guard.name}</h3>
              <p className={styles.planGuardDescription}>{plans.guard.description}</p>
              <div className={styles.planGuardPrice}>{plans.guard.price}</div>
              <p className={styles.planGuardNote}>{plans.guard.note}</p>
              <Link href="/relaunch-guard" className={styles.planGuardLink}>Learn about Relaunch Guard</Link>
            </div>
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