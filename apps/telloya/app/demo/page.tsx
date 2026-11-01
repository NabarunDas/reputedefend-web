import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { demoContent } from "@/lib/content"
import { Section, Eyebrow, SectionTitle, ButtonPrimary } from "@/components/ui"

const { seo, hero, contact, future, alternative, cta: finalCta } = demoContent

export const metadata: Metadata = {
  title: pageTitle(seo.title),
  description: seo.description,
  alternates: { canonical: "/demo" },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: "/demo",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
  },
}

export default function Demo() {
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
        <div className="max-w-2xl mx-auto">
          <SectionTitle className="mb-8">{contact.title}</SectionTitle>
          <p className="text-muted mb-8">{contact.lead}</p>
          
          <div className="card mb-8">
            <p className="text-lg font-semibold mb-4">Email us:</p>
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent(contact.subject)}`}
              className="text-2xl font-bold text-green hover:underline"
            >
              {contact.email}
            </a>
            <p className="text-sm text-muted mt-4">Subject: {contact.subject}</p>
          </div>

          <div className="card">
            <h3 className="font-bold mb-4">What to include in your enquiry:</h3>
            <ul className="space-y-3">
              {contact.whatToInclude.map((item) => (
                <li key={item} className="text-muted pl-6 relative">
                  <span className="absolute left-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section>
        <div className="max-w-2xl mx-auto card text-center">
          <h2 className="section-title mb-6">{future.title}</h2>
          <p className="text-muted mb-4">{future.description}</p>
          <p className="text-sm text-muted italic">{future.note}</p>
        </div>
      </Section>

      <Section background="surface">
        <div className="max-w-2xl mx-auto text-center">
          <Eyebrow>{alternative.eyebrow}</Eyebrow>
          <SectionTitle className="mb-4">{alternative.title}</SectionTitle>
          <p className="text-muted mb-8">{alternative.lead}</p>
          <ButtonPrimary href={alternative.href}>{alternative.cta}</ButtonPrimary>
        </div>
      </Section>

      <Section>
        <div className="max-w-2xl mx-auto text-center">
          <SectionTitle className="mb-4">{finalCta.title}</SectionTitle>
          <p className="text-muted">{finalCta.description}</p>
        </div>
      </Section>
    </main>
  )
}
