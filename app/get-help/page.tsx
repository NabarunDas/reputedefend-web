import type { Metadata } from "next"
import { CaseIntakeForm } from "@/components/case-intake-form"
import { pageTitle } from "@/lib/brand"
import { parseServiceParam } from "@/lib/enquiry"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import {
  getHelpHero,
  getHelpOutcome,
  getHelpProcess,
  getHelpRoutes,
  getHelpSecurity,
  getHelpSeo,
  getHelpTrustStrip,
} from "./content"
import styles from "./get-help.module.css"

const title = pageTitle(getHelpSeo.titlePage)
const description = getHelpSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/get-help" },
  openGraph: socialOpenGraph({ title, description, path: "/get-help" }),
  twitter: socialTwitter({ title, description }),
}

export default async function GetHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[] }>
}) {
  const params = await searchParams
  const initialService = parseServiceParam(params.service)

  return (
    <div className={`${styles.page} font-sans`}>
      <section className={styles.heroBand} aria-labelledby="get-help-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{getHelpHero.eyebrow}</p>
          <h1 id="get-help-title">
            <span className={styles.titleMain}>{getHelpHero.titleLines[0]}</span>
            <span>{getHelpHero.titleLines[1]}</span>
          </h1>
          <p className={styles.lead}>{getHelpHero.lead}</p>
          <p className={styles.heroNote}>{getHelpHero.supportLine}</p>
          <div className={styles.routes}>
            <article className={styles.routeLive}>
              <p className={styles.statusLive}>{getHelpRoutes.live.status}</p>
              <p className={styles.routeTitle}>{getHelpRoutes.live.title}</p>
              <p>{getHelpRoutes.live.copy}</p>
            </article>
            <article className={styles.routeSoon}>
              <p className={styles.statusSoon}>
                {getHelpRoutes.future.status}
              </p>
              <p className={styles.routeTitle}>{getHelpRoutes.future.title}</p>
              <p>{getHelpRoutes.future.copy}</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="How this assessment works">
        <ul>
          {getHelpTrustStrip.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>

      <div className={styles.main}>
        <div className={styles.formColumn}>
          <CaseIntakeForm initialService={initialService} />
        </div>
        <aside className={styles.aside}>
          <section className={styles.process} aria-labelledby="next-title">
            <h2 id="next-title">{getHelpProcess.title}</h2>
            <ol>
              {getHelpProcess.steps.map((step) => (
                <li key={step.n}>
                  <span className={styles.step} aria-hidden="true">
                    {step.n}
                  </span>
                  <p>{step.title}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.outcome} aria-labelledby="outcome-title">
            <h2 id="outcome-title">{getHelpOutcome.title}</h2>
            <p>{getHelpOutcome.copy}</p>
          </section>
          <section className={styles.security} aria-labelledby="security-title">
            <h2 id="security-title">{getHelpSecurity.title}</h2>
            <p>{getHelpSecurity.copy}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
