# Telloya M-03A — interactive product demonstration

**Date:** 7 November 2026 (UK).
**Base:** `develop` at `53e64af4`, including merged Marketing M-02A (PR #447).
**Script version:** `telloya-interactive-demo-v1`.

This page is an illustration. It is not a live AI call, a telephone connection, or a customer record. It does not approve the M-02A legal drafts, and it does not start a real voice demonstration. That remains M-03B.

## What was built

`/demo` is now a page. It no longer redirects to `/enquire`.

The page explains what Telloya is designed to do, then plays one fixed plumbing enquiry in the browser. Visitors can start the sample, move to the next step, go back, replay from the beginning, or open the lead summary. The controls are buttons. Arrow keys do the same thing while a sample button is focused. Nothing is sent to a server.

The visible disclosure is:

> Interactive illustration using fictional information. This is not a live AI call, telephone connection or customer record.

The page also says the sample stays in the browser and does not place a call, record audio, store a transcript, track usage, or create a lead.

## Where it is linked

| Surface | Change |
| --- | --- |
| Homepage example section | Adds “See Telloya in Action” beside the existing features link |
| How It Works example | Adds the same link under the existing illustrative greeting |
| Footer | Adds the same link in the Telloya column |
| `/demo` | “Explore Pricing” goes to `/pricing`. “Enquire About Telloya” goes to `/enquire` |

The homepage hero is unchanged: the headline “Never Misses a Call”, the two primary calls to action, the console image, and the header navigation. The enquiry form is still the enquiry journey. Public submission stays off unless `TELLOYA_ENQUIRY_ENABLED` is set. Indexing stays off unless production and `TELLOYA_LAUNCHED` are both set. When both are set, `/demo` is listed in the sitemap with the other marketing pages.

## Exact script

Alex Rowan, Hartley Plumbing, Larkspur Close, and Fernwick are fictional. No telephone number appears.

1. **Owner occupied.** “A customer calls during a job.” Alex Rowan calls Hartley Plumbing. The owner is occupied on another job and does not answer.
2. **Conditional forward.** “The unanswered call is forwarded.” In this example, Hartley Plumbing has already set conditional forwarding, and the provider supports it. The missed call is forwarded to Telloya. That setup is assumed here. It depends on the customer's telephone provider and location, and it is not available for every line.
3. **Greeting.** Telloya: “Hello, you've reached Hartley Plumbing. I'm an AI receptionist. The owner is on a job and can't take your call. I can collect an enquiry so they can decide whether to call you back. Would you like to continue?”
4. **Greeting.** Alex Rowan: “Yes, please.”
5. **The problem.** Alex Rowan: “The kitchen tap is dripping into the sink. I'd like someone to look at it.”
6. **Details.** Telloya: “Thank you. What is the approximate location, how should the business reach you, and when would you prefer a callback? I will not book a visit.”
7. **Details.** Alex Rowan: “It's 14 Larkspur Close in Fernwick. I've given a callback number. Tomorrow afternoon would suit me.”
8. **Details.** Telloya: “I'll pass on a kitchen tap drip at 14 Larkspur Close, Fernwick, and a preferred callback tomorrow afternoon. Hartley Plumbing decides whether and when to call. Nothing is booked.”

The lead summary then shows:

| Field | Value |
| --- | --- |
| Service requested | Kitchen tap repair |
| Problem | Kitchen tap dripping into the sink |
| Approximate location | 14 Larkspur Close, Fernwick |
| Callback number | A callback number was collected in this example and is not shown |
| Preferred callback window | Tomorrow afternoon. No visit is booked. |

The summary says it has not been saved. No appointment is confirmed.

The canonical text is `apps/telloya/lib/demo-script.ts`. The player is `apps/telloya/app/demo/demo-player.tsx`.

## Accessibility

- The disclosure is a note, and the sample is a named region.
- Every control has a visible name: Start the sample, Next step, Previous step, Replay from the beginning, View the lead summary.
- Buttons are `type="button"`. There is no form, field, or choice that collects a visitor's details.
- Starting moves focus to Next step. Opening the summary moves focus to its heading. Replaying moves focus back to Start the sample.
- A polite live region announces the current step while focus stays on the buttons.
- Focus outlines use the light green ring already used on the dark pages.
- The transcript is present at full opacity. A short fade runs only when the visitor has not asked for reduced motion. The reduced-motion rule removes animation and transition on this page.
- At 1024px and below, the stage list stacks above the conversation. At 640px and below, the controls become full-width and the stage names wrap.

## Checks on 7 November 2026 (UK)

- Telloya tests: 174 passed, including `app/demo/demo.test.tsx`
- Root tests: 1027 passed, 4 skipped
- Root and Telloya typecheck: passed
- Lint: 0 errors, 7 existing warnings
- Root and Telloya production builds: passed. `/demo` is a static route
- Marketing smoke: passed
- Telloya smoke: passed for `TELLOYA_LAUNCHED=false` and `TELLOYA_LAUNCHED=true`, including `/demo` returning 200 with the disclosure, the fictional business, and the two calls to action

Browser checks of the running page, same day:

- 1440px desktop: introduction, step 5 (the dripping tap), and the lead summary
- 768px tablet: lead summary, with the stage list above the card and the calls to action in reach
- 390px mobile: introduction through the calls to action, with full-width controls
- Homepage hero at 1440px: “Never Misses a Call” and the existing primary calls to action

## M-03B prerequisites

A real voice demonstration is a separate phase. It needs all of the following before any visitor can speak to a provider:

- An owner decision to attempt a real voice demo at all
- Provider confirmation of the voice, accent, language, country, and carrier behaviour that the demo would use
- A verified recording, transcript, retention, and training setting, matching the M-02A privacy review
- The caller disclosure spoken before any real conversation, using text the owner and counsel have approved
- No emergency-call claim, and no statement that a visit has been booked
- The M-02A service agreement and privacy supplement still unpublished until they are approved
- Retell, Twilio, Stripe, call routing, and forwarding remaining off until that later phase explicitly enables a bounded test

This phase does not connect a provider, place or receive a call, write a database row, or change Admin or Customer workflows.
