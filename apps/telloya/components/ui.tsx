/**
 * Reusable UI components for Telloya marketing site.
 * Matches ProfileRelaunch design system while maintaining Telloya brand.
 */

import Link from "next/link"
import type { ReactNode } from "react"

// Button Components
interface ButtonProps {
  href: string
  children: ReactNode
  variant?: "primary" | "secondary"
  className?: string
}

export function ButtonPrimary({ href, children, className = "" }: ButtonProps) {
  const isExternal = href.startsWith("http") || href.startsWith("mailto:")
  
  if (isExternal) {
    return (
      <a
        href={href}
        className={`button-primary ${className}`}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }
  
  return (
    <Link href={href} className={`button-primary ${className}`}>
      {children}
    </Link>
  )
}

export function ButtonSecondary({ href, children, className = "" }: ButtonProps) {
  const isExternal = href.startsWith("http") || href.startsWith("mailto:")
  
  if (isExternal) {
    return (
      <a
        href={href}
        className={`button-secondary ${className}`}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }
  
  return (
    <Link href={href} className={`button-secondary ${className}`}>
      {children}
    </Link>
  )
}

// Section Components
interface SectionProps {
  children: ReactNode
  className?: string
  background?: "paper" | "surface"
}

export function Section({ children, className = "", background = "paper" }: SectionProps) {
  const bgClass = background === "surface" ? "bg-surface" : ""
  return (
    <section className={`py-16 md:py-24 ${bgClass} ${className}`}>
      <div className="container">{children}</div>
    </section>
  )
}

// Text Components
interface EyebrowProps {
  children: ReactNode
  className?: string
}

export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

interface SectionTitleProps {
  children: ReactNode
  className?: string
}

export function SectionTitle({ children, className = "" }: SectionTitleProps) {
  return <h2 className={`section-title ${className}`}>{children}</h2>
}

// Card Components
interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  )
}

// Feature Card
interface FeatureCardProps {
  kicker?: string
  title: string
  description: string
  points?: readonly string[]
  status?: string
  note?: string
}

export function FeatureCard({ kicker, title, description, points, status, note }: FeatureCardProps) {
  return (
    <Card>
      {kicker && <p className="feature-kicker">{kicker}</p>}
      <h3 className="feature-title">{title}</h3>
      {status && <p className="feature-status">{status}</p>}
      <p className="feature-description">{description}</p>
      {points && points.length > 0 && (
        <ul className="feature-points">
          {points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
      {note && <p className="feature-note">{note}</p>}
    </Card>
  )
}

// Step Card
interface StepCardProps {
  number: string
  title: string
  description: string
  detail?: string
}

export function StepCard({ number, title, description, detail }: StepCardProps) {
  return (
    <div className="step-card">
      <div className="step-number">{number}</div>
      <h3 className="step-title">{title}</h3>
      <p className="step-description">{description}</p>
      {detail && <p className="step-detail">{detail}</p>}
    </div>
  )
}

// FAQ Component
interface FaqItemProps {
  question: string
  answer: string
}

export function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <div className="faq-item">
      <h3 className="faq-question">{question}</h3>
      <p className="faq-answer">{answer}</p>
    </div>
  )
}

// CTA Section
interface CtaSectionProps {
  title: string
  description?: string
  cta: string
  href: string
  className?: string
}

export function CtaSection({ title, description, cta, href, className = "" }: CtaSectionProps) {
  return (
    <Section className={`text-center ${className}`}>
      <div className="cta-content">
        <h2 className="section-title">{title}</h2>
        {description && <p className="cta-description">{description}</p>}
        <ButtonPrimary href={href}>{cta}</ButtonPrimary>
      </div>
    </Section>
  )
}

// Industry Scenario Card
interface ScenarioProps {
  title: string
  situation: string
  telloyaHelps: string
}

export function ScenarioCard({ title, situation, telloyaHelps }: ScenarioProps) {
  return (
    <div className="scenario-card">
      <h4 className="scenario-title">{title}</h4>
      <div className="scenario-detail">
        <p className="scenario-label">Situation:</p>
        <p className="scenario-text">{situation}</p>
      </div>
      <div className="scenario-detail">
        <p className="scenario-label">Telloya helps:</p>
        <p className="scenario-text">{telloyaHelps}</p>
      </div>
    </div>
  )
}

// Example Lead Card
interface LeadCardProps {
  label: string
  caller: string
  service: string
  location: string
  problem: string
  callback: string
  time: string
}

export function LeadCard({ label, caller, service, location, problem, callback, time }: LeadCardProps) {
  return (
    <Card className="lead-card">
      <div className="lead-label">{label}</div>
      <div className="lead-header">
        <h4 className="lead-caller">{caller}</h4>
        <span className="lead-time">{time}</span>
      </div>
      <div className="lead-details">
        <div className="lead-row">
          <span className="lead-key">Service:</span>
          <span className="lead-value">{service}</span>
        </div>
        <div className="lead-row">
          <span className="lead-key">Location:</span>
          <span className="lead-value">{location}</span>
        </div>
        <div className="lead-row">
          <span className="lead-key">Issue:</span>
          <span className="lead-value">{problem}</span>
        </div>
        <div className="lead-row">
          <span className="lead-key">Callback:</span>
          <span className="lead-value">{callback}</span>
        </div>
      </div>
    </Card>
  )
}

// Pricing Plan Card
interface PricingPlanProps {
  name: string
  tagline: string
  description: string
  status: string
  features: readonly string[]
  notes?: readonly string[]
  cta: string
  href: string
  highlight?: boolean
}

export function PricingPlanCard({
  name,
  tagline,
  description,
  status,
  features,
  notes,
  cta,
  href,
  highlight = false,
}: PricingPlanProps) {
  return (
    <Card className={`pricing-plan ${highlight ? "pricing-plan-highlight" : ""}`}>
      {highlight && <div className="pricing-badge">Recommended</div>}
      <h3 className="pricing-plan-name">{name}</h3>
      <p className="pricing-plan-tagline">{tagline}</p>
      <p className="pricing-plan-description">{description}</p>
      <div className="pricing-status">{status}</div>
      <ul className="pricing-features">
        {features.map((feature, index) => (
          <li key={index}>{feature}</li>
        ))}
      </ul>
      {notes && notes.length > 0 && (
        <div className="pricing-notes">
          {notes.map((note, index) => (
            <p key={index} className="pricing-note">
              {note}
            </p>
          ))}
        </div>
      )}
      <ButtonPrimary href={href} className="pricing-cta">
        {cta}
      </ButtonPrimary>
    </Card>
  )
}
