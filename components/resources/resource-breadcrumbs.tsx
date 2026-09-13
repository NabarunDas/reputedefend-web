import Link from "next/link"
import { getResourceCategory, type ResourceRecord } from "@/lib/resources"
import styles from "./resource-article.module.css"

export function ResourceBreadcrumbs({ resource }: { resource: ResourceRecord }) {
  const category = getResourceCategory(resource.category)

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <ol>
        <li>
          <Link href="/resources">Resources</Link>
        </li>
        <li>
          <Link href={`/resources#category-${category.id}`}>{category.title}</Link>
        </li>
        <li aria-current="page">{resource.title}</li>
      </ol>
    </nav>
  )
}
