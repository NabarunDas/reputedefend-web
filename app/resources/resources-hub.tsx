import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ResourceCard } from "@/components/resources/resource-card"
import { ResourceCategoryCard, ResourceLibrary } from "@/components/resources/resource-library"
import { pickFeaturedResource, resourceCategories, type ResourceRecord } from "@/lib/resources"
import {
  resourcesBrowse,
  resourcesFeaturedEmpty,
  resourcesHowProduced,
  resourcesHubHero,
  resourcesLibrary,
} from "./content"
import styles from "./resources.module.css"

export function ResourcesHub({ published }: { published: ResourceRecord[] }) {
  const featured = pickFeaturedResource(published)

  return (
    <div className={styles.page}>
      <section className={styles.heroBand} aria-labelledby="resources-title">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>{resourcesHubHero.eyebrow}</p>
          <h1 id="resources-title">{resourcesHubHero.title}</h1>
          <p className={styles.lead}>{resourcesHubHero.lead}</p>
          <p className={styles.trustLine}>{resourcesHubHero.trustLine}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href={resourcesHubHero.primaryHref}>
              {resourcesHubHero.primaryCta}
            </a>
            <Link className={styles.secondary} href={resourcesHubHero.secondaryHref}>
              {resourcesHubHero.secondaryCta}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.featured} aria-labelledby="featured-resource">
        {featured ? (
          <>
            <p className={styles.eyebrow}>Featured resource</p>
            <h2 id="featured-resource">{featured.title}</h2>
            <ResourceCard resource={featured} />
          </>
        ) : (
          <div className={styles.featuredIntro}>
            <p className={styles.eyebrow}>{resourcesFeaturedEmpty.eyebrow}</p>
            <h2 id="featured-resource">{resourcesFeaturedEmpty.title}</h2>
            <p>{resourcesFeaturedEmpty.copy}</p>
          </div>
        )}
      </section>

      <section className={styles.browse} id="browse-by-problem" aria-labelledby="browse-title">
        <p className={styles.eyebrow}>{resourcesBrowse.eyebrow}</p>
        <h2 id="browse-title">{resourcesBrowse.title}</h2>
        <p className={styles.browseLead}>{resourcesBrowse.lead}</p>
        <div className={styles.categoryGrid}>
          {resourceCategories.map((category) => (
            <ResourceCategoryCard
              key={category.id}
              id={category.id}
              title={category.title}
              description={category.description}
              urgentLabel={category.urgentLabel}
              count={published.filter((item) => item.category === category.id).length}
              emptyLabel={resourcesBrowse.emptyCount}
            />
          ))}
        </div>
      </section>

      <section className={styles.library} id={resourcesLibrary.id} aria-labelledby="library-title">
        <p className={styles.eyebrow}>{resourcesLibrary.eyebrow}</p>
        <h2 id="library-title">{resourcesLibrary.title}</h2>
        {published.length === 0 ? (
          <p className={styles.libraryEmpty}>{resourcesLibrary.empty}</p>
        ) : (
          <ResourceLibrary resources={published} />
        )}
      </section>

      <section className={styles.how} aria-labelledby="how-produced-title">
        <p className={styles.eyebrow}>{resourcesHowProduced.eyebrow}</p>
        <h2 id="how-produced-title">{resourcesHowProduced.title}</h2>
        <p className={styles.howCopy}>{resourcesHowProduced.copy}</p>
        <p className={styles.howCopy}>{resourcesHowProduced.independence}</p>
      </section>
    </div>
  )
}
