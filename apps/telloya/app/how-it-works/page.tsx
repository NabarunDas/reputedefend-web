import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { howItWorksContent } from "@/lib/content"
import { Section, Eyebrow, SectionTitle, StepCard, CtaSection } from "@/components/ui"

const { seo, hero, journey, experience, setup, limitations, cta } = howItWorksContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/how-it-works",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function HowItWorks() {
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
        <div className="mb-12">
          <SectionTitle>{journey.title}</SectionTitle>
        </div>
        <div className="max-w-4xl mx-auto">
          {journey.steps.map((step) => (
            <StepCard
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
              detail={step.detail}
            />
          ))}
        </div>
      </Section>

      <Section>
        <div className="mb-12">
          <Eyebrow>{experience.eyebrow}</Eyebrow>
          <SectionTitle>{experience.title}</SectionTitle>
          <p className="text-muted max-w-prose">{experience.lead}</p>
        </div>
        <div className="max-w-3xl card">
          <p className="mb-6 font-semibold">{experience.example.greeting}</p>
          <ul className="space-y-3">
            {experience.example.flow.map((item, index) => (
              <li key={index} className="text-muted pl-6 relative">
                <span className="absolute left-0">→</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted italic">{experience.example.note}</p>
        </div>
      </Section>

      <Section background="surface">
        <div className="mb-12">
          <Eyebrow>{setup.eyebrow}</Eyebrow>
          <SectionTitle>{setup.title}</SectionTitle>
          <p className="text-muted max-w-prose">{setup.lead}</p>
        </div>
        <div className="grid-3 max-w-4xl mx-auto">
          {setup.steps.map((step, index) => (
            <div key={index} className="card">
              <h3 className="feature-title">{step.title}</h3>
              <p className="text-muted">{step.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-muted max-w-prose mx-auto">{setup.note}</p>
      </Section>

      <Section>
        <div className="mb-8">
          <Eyebrow>{limitations.eyebrow}</Eyebrow>
          <SectionTitle>{limitations.title}</SectionTitle>
          <p className="text-muted max-w-prose">{limitations.lead}</p>
        </div>
        <div className="max-w-3xl card">
          <ul className="space-y-3">
            {limitations.points.map((point, index) => (
              <li key={index} className="text-muted pl-6 relative">
                <span className="absolute left-0">•</span>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <CtaSection title={cta.title} description={cta.description} cta={cta.cta} href={cta.href} />
    </main>
  )
}
