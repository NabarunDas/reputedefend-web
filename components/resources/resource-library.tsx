"use client"

import { useMemo } from "react"
import {
  getResourceCategory,
  type ResourceCategoryId,
  type ResourceRecord,
} from "@/lib/resources"
import { ResourceCard } from "./resource-card"
import styles from "../../app/resources/resources.module.css"

export function ResourceLibrary({
  resources,
  filter,
  onFilterChange,
}: {
  resources: ResourceRecord[]
  filter: ResourceCategoryId | "all"
  onFilterChange: (filter: ResourceCategoryId | "all") => void
}) {
  const visible = useMemo(
    () => (filter === "all" ? resources : resources.filter((item) => item.category === filter)),
    [filter, resources],
  )
  const activeCategories = useMemo(() => {
    const ids = new Set(resources.map((item) => item.category))
    return [...ids]
  }, [resources])

  if (resources.length === 0) return null

  return (
    <div>
      <div className={styles.filterRow} role="group" aria-label="Filter published resources">
        <button
          type="button"
          className={styles.filterChip}
          aria-pressed={filter === "all"}
          onClick={() => onFilterChange("all")}
        >
          All published guides
        </button>
        {activeCategories.map((id) => {
          const category = getResourceCategory(id)
          return (
            <button
              key={id}
              type="button"
              className={styles.filterChip}
              aria-pressed={filter === id}
              onClick={() => onFilterChange(id)}
            >
              {category.title}
            </button>
          )
        })}
      </div>
      <div className={styles.libraryList}>
        {visible.map((resource) => (
          <ResourceCard key={resource.slug} resource={resource} />
        ))}
      </div>
    </div>
  )
}

export function ResourceCategoryCard({
  id,
  title,
  description,
  urgentLabel,
  count,
  emptyLabel,
  selected = false,
  onSelect,
}: {
  id: ResourceCategoryId
  title: string
  description: string
  urgentLabel?: string
  count: number
  emptyLabel: string
  selected?: boolean
  onSelect?: (id: ResourceCategoryId) => void
}) {
  const selectable = count > 0 && Boolean(onSelect)
  const meta = count === 0 ? emptyLabel : count === 1 ? "1 published guide" : `${count} published guides`

  return (
    <article
      className={selected && selectable ? `${styles.categoryCard} ${styles.categoryCardSelected}` : styles.categoryCard}
      id={`category-${id}`}
    >
      <h3 className={styles.categoryTitle}>
        <span>{title}</span>
        {urgentLabel ? <span className={styles.urgentLabel}>{urgentLabel}</span> : null}
      </h3>
      <p className={styles.categoryCopy}>{description}</p>
      {selectable ? (
        <button
          type="button"
          className={styles.categoryAction}
          aria-pressed={selected}
          aria-controls="resource-library"
          onClick={() => onSelect?.(id)}
        >
          {`${meta} in ${title}`}
        </button>
      ) : (
        <p className={styles.categoryMeta}>{meta}</p>
      )}
    </article>
  )
}
