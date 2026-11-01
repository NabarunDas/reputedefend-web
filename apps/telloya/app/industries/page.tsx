import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { industriesContent } from "@/lib/content"
import { Section, Eyebrow, SectionTitle, ScenarioCard, CtaSection } from "@/components/ui"

const { seo, hero, industries, universal, cta } = industriesContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/industries" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/industries",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Industries() {
  return (
    <main>
      <Section className="hero">
        <div className="hero-content">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="hero-headline">{hero.title}</h1>
          <p className="hero-supporting">{hero.lead}</p>
        </div>
      </Section>

      {industries.map((industry, index) => (
        <Section key={industry.name} background={index % 2 === 0 ? "surface" : "paper"}>
          <div className="mb-12">
            <h2 className="section-title">{industry.name}</h2>
            <p className="text-lg font-semibold text-green mb-4">{industry.tagline}</p>
            <p className="text-muted max-w-prose">{industry.description}</p>
          </div>
          <div className="max-w-4xl mx-auto">
            <h3 className="text-xl font-bold mb-6">Example scenarios</h3>
            {industry.scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.title}
                title={scenario.title}
                situation={scenario.situation}
                telloyaHelps={scenario.telletoyaHelps}
              />
            ))}
            <div className="mt-8 card">
              <h4 className="font-bold mb-4">Key benefits for {industry.name.toLowerCase()}</h4>
              <ul className="feature-points">
                {industry.benefits.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      ))}

      <Section background="surface">
        <div className="text-center mb-12">
          <Eyebrow>{universal.eyebrow}</Eyebrow>
          <SectionTitle>{universal.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{universal.lead}</p>
        </div>
        <div className="grid-4 max-w-4xl mx-auto">
          {universal.examples.map((example) => (
            <div key={example} className="card text-center">
              <p className="font-semibold">{example}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaSection title={cta.title} cta={cta.cta} href={cta.href} />
    </main>
  )
}
