import Link from "next/link"
import type { LegalBlock, LegalSection } from "@/lib/legal-notices"
import { legalReviewBanner, legalReviewDate } from "@/lib/legal-notices"
import styles from "./legal-document.module.css"

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "list") {
    return (
      <ul>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    )
  }
  if (block.kind === "link") {
    const external = block.href.startsWith("http") || block.href.startsWith("mailto:")
    const link = external
      ? <a href={block.href} rel="noopener noreferrer">{block.label}</a>
      : <Link href={block.href}>{block.label}</Link>
    return <p>{block.before}{link}{block.after ?? ""}</p>
  }
  return <p>{block.text}</p>
}

export function LegalDocument({
  eyebrow,
  title,
  lead,
  sections,
}: {
  eyebrow: string
  title: string
  lead: string
  sections: readonly LegalSection[]
}) {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="legal-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 id="legal-title" className={styles.heroTitle}>{title}</h1>
          <p className={styles.heroLead}>{lead}</p>
          <p className={styles.meta}>Draft for legal review · {legalReviewDate}</p>
        </div>
      </section>
      <div className={styles.body}>
        <div className={styles.sectionWrap}>
          <p className={styles.banner} role="note">{legalReviewBanner}</p>
          <nav className={styles.toc} aria-label="On this page">
            <h2>On this page</h2>
            <ol>
              {sections.map((section) => (
                <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
              ))}
            </ol>
          </nav>
          {sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`} className={styles.sectionTitle}>{section.title}</h2>
              {section.blocks.map((block, index) => <Block key={`${section.id}-${index}`} block={block} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
