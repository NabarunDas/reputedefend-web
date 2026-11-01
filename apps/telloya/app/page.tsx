import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { homepageContent } from "@/lib/content"
import {
  ButtonPrimary,
  ButtonSecondary,
  Section,
  Eyebrow,
  SectionTitle,
  StepCard,
  LeadCard,
  FaqItem,
  CtaSection,
} from "@/components/ui"

const { seo, hero, problem, howItWorks, benefits, example, audience, plans, faq, finalCta } =
  homepageContent

export const metadata: Metadata = {
  title: { absolute: pageTitle(seo.title) },
  description: seo.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <Section className="hero">
        <div className="hero-content">
          <h1 className="hero-headline">{hero.headline}</h1>
          <p className="hero-supporting">{hero.supporting}</p>
          <div className="hero-ctas">
            <ButtonPrimary href={hero.primaryHref}>{hero.primaryCta}</ButtonPrimary>
            <ButtonSecondary href={hero.secondaryHref}>{hero.secondaryCta}</ButtonSecondary>
          </div>
        </div>
      </Section>

      {/* Problem */}
      <Section background="surface">
        <div className="text-center mb-12">
          <Eyebrow>{problem.eyebrow}</Eyebrow>
          <SectionTitle>{problem.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{problem.lead}</p>
        </div>
        <div className="grid-2 max-w-3xl mx-auto">
          {problem.points.map((point, index) => (
            <div key={index} className="card">
              <p>{point}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How It Works */}
      <Section>
        <div className="text-center mb-12">
          <Eyebrow>{howItWorks.eyebrow}</Eyebrow>
          <SectionTitle>{howItWorks.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{howItWorks.lead}</p>
        </div>
        <div className="max-w-4xl mx-auto">
          {howItWorks.steps.map((step) => (
            <StepCard
              key={step.number}
              number={step.number}
              title={step.title}
              description={step.description}
            />
          ))}
        </div>
        <p className="text-center text-muted mt-8 max-w-prose mx-auto">{howItWorks.note}</p>
      </Section>

      {/* Benefits */}
      <Section background="surface">
        <div className="text-center mb-12">
          <Eyebrow>{benefits.eyebrow}</Eyebrow>
          <SectionTitle>{benefits.title}</SectionTitle>
        </div>
        <div className="grid-2 max-w-4xl mx-auto">
          {benefits.items.map((item) => (
            <div key={item.title} className="card">
              <h3 className="feature-title">{item.title}</h3>
              <p className="text-muted">{item.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Example */}
      <Section>
        <div className="text-center mb-12">
          <Eyebrow>{example.eyebrow}</Eyebrow>
          <SectionTitle>{example.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{example.lead}</p>
        </div>
        <LeadCard
          label={example.card.label}
          caller={example.card.caller}
          service={example.card.service}
          location={example.card.location}
          problem={example.card.problem}
          callback={example.card.callback}
          time={example.card.time}
        />
      </Section>

      {/* Audience */}
      <Section background="surface">
        <div className="text-center mb-12">
          <Eyebrow>{audience.eyebrow}</Eyebrow>
          <SectionTitle>{audience.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{audience.lead}</p>
        </div>
        <div className="grid-3 max-w-3xl mx-auto">
          {audience.industries.map((industry) => (
            <div key={industry} className="card text-center">
              <p className="font-semibold">{industry}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Plans */}
      <Section>
        <div className="text-center mb-12">
          <Eyebrow>{plans.eyebrow}</Eyebrow>
          <SectionTitle>{plans.title}</SectionTitle>
          <p className="text-muted max-w-prose mx-auto">{plans.lead}</p>
        </div>
        <div className="grid-2 max-w-4xl mx-auto">
          <div className="card">
            <h3 className="pricing-plan-name">{plans.telloya.name}</h3>
            <p className="text-muted mb-6">{plans.telloya.description}</p>
            <ul className="feature-points mb-8">
              {plans.telloya.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <ButtonPrimary href={plans.telloya.href}>{plans.telloya.cta}</ButtonPrimary>
          </div>
          <div className="card">
            <h3 className="pricing-plan-name">{plans.complete.name}</h3>
            <p className="text-muted mb-6">{plans.complete.description}</p>
            <ul className="feature-points mb-6">
              {plans.complete.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="text-sm text-muted mb-8">{plans.complete.note}</p>
            <ButtonPrimary href={plans.complete.href}>{plans.complete.cta}</ButtonPrimary>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section background="surface">
        <div className="text-center mb-12">
          <Eyebrow>{faq.eyebrow}</Eyebrow>
          <SectionTitle>{faq.title}</SectionTitle>
        </div>
        <div className="max-w-3xl mx-auto">
          {faq.questions.map((item) => (
            <FaqItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <CtaSection title={finalCta.title} cta={finalCta.cta} href={finalCta.href} />
    </>
  )
}
