type OrganizationSchema = {
  "@context": "https://schema.org"
  "@type": "Organization"
  name: "ReputeDefend"
  url: string
  logo: string
  description: string
}

type ServiceSchemaProps = {
  name: string
  description: string
  path: string
}

export function OrganizationStructuredData() {
  const schema: OrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ReputeDefend",
    url: "https://reputedefend.com",
    logo: "https://reputedefend.com/icon.png",
    description: "Independent, practical support for Google Business Profile recovery and review issues.",
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function ServiceStructuredData({ name, description, path }: ServiceSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: `https://reputedefend.com${path}`,
    provider: {
      "@type": "Organization",
      name: "ReputeDefend",
      url: "https://reputedefend.com",
    },
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function FaqStructuredData({ questions }: { questions: Array<{ q: string; a: string }> }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function HowToStructuredData({
  name,
  description,
  steps,
}: {
  name: string
  description: string
  steps: Array<{ name: string; text: string }>
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}
