import Link from "next/link"
import type { ResourceArticleBody } from "@/lib/resource-content"
import { conversionForCommercialRoute } from "@/lib/resource-links"
import {
  formatResourceLongDate,
  getResourceCategory,
  isPublicResource,
  relatedPublishedResources,
  type ResourceRecord,
} from "@/lib/resources"
import { resourceArticleJsonLd, resourceBreadcrumbJsonLd } from "@/lib/resource-schema"
import { ResourceBreadcrumbs } from "./resource-breadcrumbs"
import { AppealRejectedPilotView } from "./appeal-rejected-pilot-view"
import { EvidenceChecklistPilotView } from "./evidence-checklist-pilot-view"
import { SuspensionPilotView } from "./suspension-pilot-view"
import { FakeReviewAssessmentPilotView } from "./fake-review-assessment-pilot-view"
import { ReviewBombingPilotView } from "./review-bombing-pilot-view"
import { ReviewExtortionPilotView } from "./review-extortion-pilot-view"
import { ReviewRemovalPilotView } from "./review-removal-pilot-view"
import { VerificationStuckPilotView } from "./verification-stuck-pilot-view"
import { ResourceCard } from "./resource-card"
import {
  ResourceBeforeYouAct,
  ResourceChecklist,
  ResourceCommonMistakes,
  ResourceConversion,
  ResourceHowProduced,
  ResourceOfficialSources,
  ResourceSourceBibliography,
  ResourceUrgentCallout,
} from "./resource-article-blocks"
import styles from "./resource-article.module.css"

export function ResourceArticleView({
  resource,
  body,
  related,
}: {
  resource: ResourceRecord
  body: ResourceArticleBody
  related?: ResourceRecord[]
}) {
  const category = getResourceCategory(resource.category)
  const relatedGuides = related ?? relatedPublishedResources(resource)
  const conversion = conversionForCommercialRoute(resource.commercialRoute)
  const sourcesUsed = body.sourcesUsed
  const googleSources = body.googleSays?.sources ?? sourcesUsed
  const exposeStructuredData = isPublicResource(resource, body)

  if (resource.slug === "google-business-profile-suspended-before-appeal") {
    return <SuspensionPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "google-business-profile-appeal-evidence-checklist") {
    return <EvidenceChecklistPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "google-business-profile-appeal-rejected-what-next") {
    return <AppealRejectedPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "google-business-profile-verification-stuck-or-rejected") {
    return <VerificationStuckPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "can-a-google-review-be-removed") {
    return <ReviewRemovalPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "fake-google-review-or-genuine-negative-feedback") {
    return <FakeReviewAssessmentPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "google-review-extortion") {
    return <ReviewExtortionPilotView resource={resource} related={relatedGuides} />
  }

  if (resource.slug === "google-review-bombing") {
    return <ReviewBombingPilotView resource={resource} related={relatedGuides} />
  }

  return (
    <article className={styles.page}>
      {exposeStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(resourceArticleJsonLd(resource)) }}
        />
      ) : null}
      {exposeStructuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(resourceBreadcrumbJsonLd(resource, category.title)) }}
        />
      ) : null}
      <ResourceBreadcrumbs resource={resource} />
      <header className={`${styles.hero} ${styles.measure}`}>
        <p className={styles.eyebrow}>
          {category.title}
          {resource.urgent && category.urgentLabel ? ` · ${category.urgentLabel}` : ""}
        </p>
        <h1>{resource.title}</h1>
        <div className={styles.intro}>
          {typeof body.intro === "string" ? <p>{body.intro}</p> : body.intro}
        </div>
        <dl className={styles.meta}>
          {resource.dateReviewed ? (
            <div>
              <dt>Last reviewed</dt>
              <dd>Last reviewed: {formatResourceLongDate(resource.dateReviewed)}</dd>
            </div>
          ) : null}
          {resource.readingMinutes ? (
            <div>
              <dt>Reading time</dt>
              <dd>Reading time: {resource.readingMinutes} min</dd>
            </div>
          ) : null}
          {resource.dateModified && resource.dateModified !== resource.datePublished ? (
            <div>
              <dt>Updated</dt>
              <dd className={styles.updated}>Updated: {formatResourceLongDate(resource.dateModified)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Author</dt>
            <dd>{resource.author}</dd>
          </div>
        </dl>
      </header>

      {body.urgentCallout ? <ResourceUrgentCallout>{body.urgentCallout}</ResourceUrgentCallout> : null}

      <section className={`${styles.quickAnswer} ${styles.measure}`} aria-labelledby="the-short-version">
        <h2 id="the-short-version">The short version</h2>
        <div className={styles.prose}>{body.quickAnswer}</div>
      </section>

      <div className={`${styles.section} ${styles.measure}`}>
        <div className={styles.prose}>{body.main}</div>
      </div>

      {body.googleSays ? (
        <ResourceOfficialSources sources={googleSources} paraphrase={body.googleSays.paraphrase} />
      ) : null}

      {body.interpretation ? (
        <section className={`${styles.section} ${styles.measure}`} aria-labelledby="what-this-means">
          <h2 id="what-this-means">What this means for your business</h2>
          <div className={styles.prose}>{body.interpretation}</div>
        </section>
      ) : null}

      {body.beforeYouAct ? <ResourceBeforeYouAct>{body.beforeYouAct}</ResourceBeforeYouAct> : null}
      {body.checklist ? <ResourceChecklist heading={body.checklist.heading} items={body.checklist.items} /> : null}
      {body.commonMistakes ? (
        <ResourceCommonMistakes heading={body.commonMistakes.heading} items={body.commonMistakes.items} />
      ) : null}

      {body.scenarios?.map((scenario) => (
        <section key={scenario.heading} className={`${styles.section} ${styles.measure} ${styles.scenario}`}>
          <h2>{scenario.heading}</h2>
          <div className={styles.prose}>{scenario.body}</div>
        </section>
      ))}

      {body.closing ? (
        <section className={`${styles.section} ${styles.measure}`}>
          <div className={styles.prose}>{body.closing}</div>
        </section>
      ) : null}

      <ResourceConversion
        heading={conversion.heading}
        body={conversion.body}
        cta={conversion.cta}
        href={conversion.href}
        trustLine={conversion.trustLine}
      />

      <section className={`${styles.related} ${styles.wide}`} aria-labelledby="continue-understanding">
        <h2 id="continue-understanding">Continue understanding your situation</h2>
        {relatedGuides.length > 0 ? (
          <div>
            {relatedGuides.map((item) => (
              <ResourceCard key={item.slug} resource={item} />
            ))}
          </div>
        ) : null}
        <p>
          <Link className={styles.exploreLink} href={conversion.exploreHref}>
            {conversion.exploreLabel}
          </Link>
        </p>
      </section>

      <ResourceHowProduced />
      <ResourceSourceBibliography sources={sourcesUsed} />
    </article>
  )
}
