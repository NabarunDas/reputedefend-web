import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { featuresContent } from "@/lib/content"
import { Section, Eyebrow, SectionTitle, FeatureCard, CtaSection } from "@/components/ui"

const { seo, hero, features, technical, future, cta } = featuresContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/features" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/features",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Features() {
  return (
    <main>
      <Section className="hero">
        <div className="hero-content">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="hero-headline">{hero.title}</h1>
          <p className="hero-supporting">{hero.lead}</p>
        </div>
      </Section>

      <Section background="surface">
        <div className="max-w-5xl mx-auto space-y-12">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              kicker={feature.kicker}
              title={feature.title}
              description={feature.description}
              status={feature.status}
              points={feature.points}
              note={"note" in feature ? feature.note : undefined}
            />
          ))}
        </div>
      </Section>

      <Section>
        <div className="mb-12">
          <Eyebrow>{technical.eyebrow}</Eyebrow>
          <SectionTitle>{technical.title}</SectionTitle>
          <p className="text-muted max-w-prose">{technical.lead}</p>
        </div>
        <div className="grid-2 max-w-3xl mx-auto">
          {technical.points.map((point, index) => (
            <div key={index} className="card">
              <p>{point}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section background="surface">
        <div className="mb-12">
          <Eyebrow>{future.eyebrow}</Eyebrow>
          <SectionTitle>{future.title}</SectionTitle>
          <p className="text-muted max-w-prose">{future.lead}</p>
        </div>
        <div className="grid-2 max-w-4xl mx-auto">
          {future.items.map((item) => (
            <div key={item.title} className="card">
              <h3 className="feature-title">{item.title}</h3>
              <p className="text-muted mb-4">{item.description}</p>
              <span className="text-sm font-semibold text-green">{item.timeline}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted max-w-prose mx-auto">{future.note}</p>
      </Section>

      <CtaSection title={cta.title} cta={cta.cta} href={cta.href} />
    </main>
  )
}
