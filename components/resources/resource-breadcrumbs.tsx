import Link from "next/link"
import { resourceCategoryLinkPath } from "@/lib/resource-category-links"
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
          <Link href={resourceCategoryLinkPath(category.id)}>{category.title}</Link>
        </li>
        <li aria-current="page">{resource.title}</li>
      </ol>
    </nav>
  )
}
