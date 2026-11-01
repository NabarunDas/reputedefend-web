import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { pricingContent } from "@/lib/content"
import { Section, Eyebrow, SectionTitle, PricingPlanCard, FaqItem, CtaSection } from "@/components/ui"

const { seo, hero, plans, comparison, commercial, faq, cta } = pricingContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/pricing",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Pricing() {
  return (
    <>
      <Section className="hero">
        <div className="hero-content">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1 className="hero-headline">{hero.title}</h1>
          <p className="hero-supporting">{hero.lead}</p>
        </div>
      </Section>

      <Section background="surface">
        <div className="grid-2 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <PricingPlanCard
              key={plan.name}
              name={plan.name}
              tagline={plan.tagline}
              description={plan.description}
              status={plan.status}
              features={plan.features}
              notes={plan.notes}
              cta={plan.cta}
              href={plan.href}
              highlight={"highlight" in plan ? plan.highlight : false}
            />
          ))}
        </div>
      </Section>

      <Section>
        <div className="mb-12">
          <Eyebrow>{comparison.eyebrow}</Eyebrow>
          <SectionTitle>{comparison.title}</SectionTitle>
          <p className="text-muted max-w-prose">{comparison.lead}</p>
        </div>
        <div className="max-w-3xl mx-auto overflow-x-auto">
          <table className="w-full card">
            <thead>
              <tr className="border-b border-line">
                {comparison.table.headers.map((header) => (
                  <th key={header} className="text-left p-4 font-bold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.table.rows.map((row, index) => (
                <tr key={index} className="border-b border-line last:border-0">
                  <td className="p-4">{row[0]}</td>
                  <td className="p-4 text-center">
                    {row[1] ? (
                      <span className="text-green font-bold text-xl">✓</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {row[2] ? (
                      <span className="text-green font-bold text-xl">✓</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section background="surface">
        <div className="mb-12">
          <Eyebrow>{commercial.eyebrow}</Eyebrow>
          <SectionTitle>{commercial.title}</SectionTitle>
        </div>
        <div className="grid-2 max-w-4xl mx-auto">
          {commercial.points.map((point) => (
            <div key={point.title} className="card">
              <h3 className="feature-title">{point.title}</h3>
              <p className="text-muted">{point.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mb-12">
          <SectionTitle>{faq.title}</SectionTitle>
        </div>
        <div className="max-w-3xl mx-auto">
          {faq.questions.map((item) => (
            <FaqItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      </Section>

      <CtaSection
        title={cta.title}
        description={cta.description}
        cta={cta.cta}
        href={cta.href}
        className="bg-surface"
      />
    </>
  )
}
