import type { Metadata } from "next"
import Link from "next/link"
import { LegalCallout, LegalPage, type LegalSection } from "@/components/legal-page"
import { feeWording, hasLegalValue, legalIdentity } from "@/lib/legal"

const title = "Terms of use | ReputeDefend"
const description = "Terms that apply to using the ReputeDefend website and sending an enquiry or case submission."

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    siteName: "ReputeDefend",
    title,
    description,
    url: "/terms",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ReputeDefend practical reputation support" }],
  },
}

const sections: LegalSection[] = [
  {
    id: "about-these-terms",
    title: "About these terms",
    content: (
      <>
        <p>These terms apply to your use of the {legalIdentity.tradingName} website and to information you send through its enquiry forms. They do not replace a separate written agreement for paid support, if one is later offered and accepted.</p>
        <p>If you do not agree with these terms, please do not use the website or send a submission.</p>
      </>
    ),
  },
  {
    id: "using-the-website",
    title: "Using this website",
    content: (
      <>
        <p>The website provides general information about independent Google Business Profile recovery and review protection support, and a way to contact {legalIdentity.tradingName}. It is intended for use in a business context.</p>
        <p>You are responsible for the device, browser and connection you use to reach the site, and for keeping your own accounts and credentials secure.</p>
      </>
    ),
  },
  {
    id: "information-on-the-site",
    title: "Information on this website",
    content: (
      <>
        <p>Content on this website is general information and practical service guidance. It is not legal advice, and it is not a decision by Google. Situations differ, and nothing on the site should be treated as a promise that a particular platform process or outcome will apply to you.</p>
        <p>Related limits are set out on the <Link href="/disclaimer">Disclaimer</Link> page.</p>
      </>
    ),
  },
  {
    id: "enquiries-and-cases",
    title: "Enquiries and case submissions",
    content: (
      <>
        <p>You may send a short enquiry from the homepage, a general message through Contact, or a fuller case submission through Get Help. Get Help is the appropriate route if you already have an active Business Profile, verification, access or review issue.</p>
        <p>Sending a form asks {legalIdentity.tradingName} to review the information you share. It does not, by itself, create a client, advisory, representation or paid-service relationship. We may ask for more information, explain that a situation is outside the support we can offer, or suggest using a different form.</p>
        <LegalCallout>A submission is received only if the enquiry process confirms it. Do not assume that a message has been delivered because a browser still shows the form.</LegalCallout>
      </>
    ),
  },
  {
    id: "fees-and-paid-support",
    title: "Fees and paid support",
    content: (
      <>
        <p>{feeWording}</p>
        <p>This website does not collect payment and does not publish a price list. If paid support is later agreed, the work, limitations and commercial terms will be set out separately. These website terms do not create refund, cancellation or package rules for a service that has not been agreed.</p>
      </>
    ),
  },
  {
    id: "accurate-information",
    title: "Your responsibility for information",
    content: (
      <>
        <p>You must make sure that information you send is accurate to the best of your knowledge, that you are entitled to send it, and that it does not include passwords, verification codes, account credentials or unnecessary sensitive personal information.</p>
        <p>You must not fabricate, alter or misrepresent evidence. Get Help asks you to confirm accuracy before a case is submitted. Misleading or incomplete information can affect whether any later support is appropriate.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You may not use this website to:</p>
        <ul>
          <li>interfere with its security or availability</li>
          <li>submit automated, deceptive or abusive messages</li>
          <li>attempt to gain unauthorised access to any system or account</li>
          <li>send malware or harmful code</li>
          <li>misuse another person’s personal information</li>
        </ul>
        <p>We may refuse or stop handling a submission that appears to breach these terms.</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    content: (
      <>
        <p>The website’s design, text and other content belong to {legalIdentity.tradingName} or its licensors, unless a page says otherwise. You may view and print pages for your own business use. You may not copy the site, present it as your own service, or use the ReputeDefend name in a way that suggests affiliation with Google or with us without permission.</p>
      </>
    ),
  },
  {
    id: "platforms",
    title: "Google and other platforms",
    content: (
      <>
        <p>{legalIdentity.tradingName} is independent of Google. We do not represent Google, do not have special access to Google’s decisions, and cannot override a platform outcome. Business Profile reinstatement, review removal, ranking changes and platform timeframes are not guaranteed.</p>
        <p>Google and other third-party services have their own terms and processes. Using this website does not change those terms.</p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability",
    content: (
      <>
        <p>We aim to keep the website and enquiry forms available, but they may be interrupted, delayed or unavailable. We do not promise uninterrupted access, a particular response time, or that every submission will be delivered.</p>
      </>
    ),
  },
  {
    id: "links",
    title: "Links to other sites",
    content: (
      <>
        <p>The website may refer to Google or other third-party sites and processes. Those destinations have their own terms and privacy practices. {legalIdentity.tradingName} is not responsible for their content or decisions.</p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy",
    content: (
      <>
        <p>The <Link href="/privacy">privacy notice</Link> explains how information submitted through this website is handled.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    content: (
      <>
        <p>We may update these terms. The date at the top of this page shows when they were last revised. Continued use of the website after a change means you accept the revised terms.</p>
      </>
    ),
  },
  ...(hasLegalValue(legalIdentity.governingLaw)
    ? [{
        id: "governing-law",
        title: "Governing law",
        content: (
          <>
            <p>These website terms are governed by {legalIdentity.governingLaw}.{hasLegalValue(legalIdentity.courts) ? ` Courts of ${legalIdentity.courts} have jurisdiction over disputes arising from these terms, without limiting any non-excludable rights you may have.` : ""}</p>
          </>
        ),
      } satisfies LegalSection]
    : []),
]

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of use"
      lead="These terms cover use of the ReputeDefend website and its enquiry forms. They do not create a paid-service contract, promise a Google decision, or replace a separate agreement if paid support is later offered."
      currentPath="/terms"
      sections={sections}
    />
  )
}
