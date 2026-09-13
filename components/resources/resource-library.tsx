"use client"

import { useMemo, useState } from "react"
import {
  getResourceCategory,
  type ResourceCategoryId,
  type ResourceRecord,
} from "@/lib/resources"
import { ResourceCard } from "./resource-card"
import styles from "../../app/resources/resources.module.css"

export function ResourceLibrary({ resources }: { resources: ResourceRecord[] }) {
  const [filter, setFilter] = useState<ResourceCategoryId | "all">("all")
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
      <div className={styles.filterRow} role="toolbar" aria-label="Filter published resources">
        <button
          type="button"
          className={styles.filterChip}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
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
              onClick={() => setFilter(id)}
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
  onSelect,
}: {
  id: ResourceCategoryId
  title: string
  description: string
  urgentLabel?: string
  count: number
  emptyLabel: string
  onSelect?: (id: ResourceCategoryId) => void
}) {
  const meta = count === 0 ? emptyLabel : count === 1 ? "1 published guide" : `${count} published guides`
  const selectable = count > 0 && onSelect

  const inner = (
    <>
      <h3 className={styles.categoryTitle}>
        <span>{title}</span>
        {urgentLabel ? <span className={styles.urgentLabel}>{urgentLabel}</span> : null}
      </h3>
      <p className={styles.categoryCopy}>{description}</p>
      <p className={styles.categoryMeta}>{meta}</p>
    </>
  )

  if (!selectable) {
    return (
      <article className={styles.categoryCard} id={`category-${id}`}>
        {inner}
      </article>
    )
  }

  return (
    <button
      type="button"
      className={styles.categoryButton}
      id={`category-${id}`}
        onClick={() => onSelect?.(id)}
    >
      {inner}
    </button>
  )
}
