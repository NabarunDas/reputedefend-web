"use client"

import { useState } from "react"
import { ResourceCategoryCard, ResourceLibrary } from "@/components/resources/resource-library"
import { resourceCategories, type ResourceCategoryId, type ResourceRecord } from "@/lib/resources"
import { resourcesBrowse, resourcesLibrary } from "@/app/resources/content"
import styles from "@/app/resources/resources.module.css"

function scrollToLibrary() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  document.getElementById(resourcesLibrary.id)?.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  })
}

export function ResourcesExplorer({ resources }: { resources: ResourceRecord[] }) {
  const [filter, setFilter] = useState<ResourceCategoryId | "all">("all")

  function selectCategory(id: ResourceCategoryId) {
    setFilter(id)
    scrollToLibrary()
  }

  return (
    <>
      <section className={styles.browse} id="browse-by-problem" aria-labelledby="browse-title">
        <p className={styles.eyebrow}>{resourcesBrowse.eyebrow}</p>
        <h2 id="browse-title">{resourcesBrowse.title}</h2>
        <p className={styles.browseLead}>{resourcesBrowse.lead}</p>
        <div className={styles.categoryGrid}>
          {resourceCategories.map((category) => {
            const count = resources.filter((item) => item.category === category.id).length
            return (
              <ResourceCategoryCard
                key={category.id}
                id={category.id}
                title={category.title}
                description={category.description}
                urgentLabel={category.urgentLabel}
                count={count}
                emptyLabel={resourcesBrowse.emptyCount}
                selected={filter === category.id}
                onSelect={count > 0 ? selectCategory : undefined}
              />
            )
          })}
        </div>
      </section>

      <section className={styles.library} id={resourcesLibrary.id} aria-labelledby="library-title">
        <p className={styles.eyebrow}>{resourcesLibrary.eyebrow}</p>
        <h2 id="library-title">{resourcesLibrary.title}</h2>
        {resources.length === 0 ? (
          <p className={styles.libraryEmpty}>{resourcesLibrary.empty}</p>
        ) : (
          <ResourceLibrary resources={resources} filter={filter} onFilterChange={setFilter} />
        )}
      </section>
    </>
  )
}
