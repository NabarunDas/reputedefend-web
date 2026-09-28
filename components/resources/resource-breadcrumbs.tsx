import Link from "next/link"
import { resourceCategoryLinkPath } from "@/lib/resource-category-links"
import { getResourceCategory, resourceAuthor, type ResourceRecord } from "@/lib/resources"
import styles from "./resource-article.module.css"

export const RESOURCE_METHODOLOGY_HREF = "/resources#how-these-guides-are-produced"
export const RESOURCE_METHODOLOGY_LABEL = "How these guides are produced"

export function ResourceBreadcrumbs({ resource }: { resource: ResourceRecord }) {
  const category = getResourceCategory(resource.category)

  return (
    <>
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
      {/* Organisational attribution, shared by every guide so the author and the
          editorial method stay consistent without editing article bodies. */}
      <p className={styles.editorialLine}>
        Prepared by <Link href="/about">{resourceAuthor}</Link>
        <span aria-hidden="true"> · </span>
        <Link href={RESOURCE_METHODOLOGY_HREF}>{RESOURCE_METHODOLOGY_LABEL}</Link>
      </p>
    </>
  )
}
