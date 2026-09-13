import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  formatResourceMonthYear,
  getResourceCategory,
  resourcePath,
  resourceShowsUpdated,
  type ResourceRecord,
} from "@/lib/resources"
import styles from "./resource-card.module.css"

export function ResourceCard({ resource }: { resource: ResourceRecord }) {
  const category = getResourceCategory(resource.category)
  const reviewed = resource.dateReviewed ? formatResourceMonthYear(resource.dateReviewed) : null
  const reading = resource.readingMinutes ? `${resource.readingMinutes} min read` : null
  const details = [reading, reviewed ? `Reviewed ${reviewed}` : null].filter(Boolean).join(" • ")

  return (
    <Link className={styles.card} href={resourcePath(resource.slug)}>
      <p className={styles.metaRow}>
        <span>{category.title}</span>
        {resource.urgent && category.urgentLabel ? (
          <span className={styles.urgent}>{category.urgentLabel}</span>
        ) : null}
      </p>
      <h3 className={styles.title}>{resource.title}</h3>
      <p className={styles.excerpt}>{resource.excerpt}</p>
      <div className={styles.footer}>
        <p className={styles.details}>
          {details}
          {resourceShowsUpdated(resource) && resource.dateModified ? (
            <>
              {" • "}
              <span className={styles.updated}>Updated {formatResourceMonthYear(resource.dateModified)}</span>
            </>
          ) : null}
        </p>
        <span className={styles.cta}>
          Read guide
          <ArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}
