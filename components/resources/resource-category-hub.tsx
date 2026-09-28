import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import {
  resourceCategoryHubBreadcrumb,
  resourceCategoryHubEmpty,
  type ResourceCategoryHub,
} from "@/app/resources/category-hub-content"
import { resourcesHowProduced } from "@/app/resources/content"
import { resourceCategoryHubBreadcrumbJsonLd } from "@/lib/resource-schema"
import { ResourceCard } from "./resource-card"
import styles from "@/app/resources/resources.module.css"

/**
 * Shared layout for the Resource topic hubs. Each hub supplies its own copy
 * and commercial destination; the visual language stays identical to the
 * Resources index so hubs do not become a second design system.
 */
export function ResourceCategoryHubView({
  hub,
  resources,
}: {
  hub: ResourceCategoryHub
  resources: ResourceRecord[]
}) {
  const category = getResourceCategory(hub.category)
  const breadcrumbJsonLd = resourceCategoryHubBreadcrumbJsonLd({
    title: category.title,
    path: hub.path,
  })

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <section className={styles.heroBand} aria-labelledby="hub-title">
        <div className={styles.hero}>
          <nav className={styles.hubBreadcrumb} aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href={resourceCategoryHubBreadcrumb.href}>{resourceCategoryHubBreadcrumb.label}</Link>
              </li>
              <li aria-current="page">{category.title}</li>
            </ol>
          </nav>
          <p className={styles.eyebrow}>{category.title}</p>
          <h1 id="hub-title">{hub.heading}</h1>
          <p className={styles.lead}>{hub.intro}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={hub.commercialHref}>
              {hub.commercialCta}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className={styles.secondary} href={resourceCategoryHubBreadcrumb.href}>
              Browse all Resources
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.library} aria-labelledby="hub-guides-title">
        <p className={styles.eyebrow}>Published guides</p>
        <h2 id="hub-guides-title">{category.title}</h2>
        <p className={styles.browseLead}>{category.description}</p>
        {resources.length === 0 ? (
          <p className={styles.libraryEmpty}>{resourceCategoryHubEmpty}</p>
        ) : (
          <div className={styles.libraryList}>
            {resources.map((resource) => (
              <ResourceCard key={resource.slug} resource={resource} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.how} aria-labelledby="hub-how-produced-title">
        <p className={styles.eyebrow}>{resourcesHowProduced.eyebrow}</p>
        <h2 id="hub-how-produced-title">{resourcesHowProduced.title}</h2>
        <p className={styles.howCopy}>{resourcesHowProduced.copy}</p>
        <p className={styles.howCopy}>{resourcesHowProduced.independence}</p>
      </section>
    </div>
  )
}
