"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import {
  DEMO_SCRIPT_VERSION,
  DEMO_SUMMARY_INDEX,
  demoBeats,
  demoLead,
  demoLiveStatus,
  demoPageCopy,
  demoStages,
  nextDemoPosition,
  previousDemoPosition,
  stageForPosition,
} from "@/lib/demo-script"
import styles from "./demo.module.css"

type FocusTarget = "start" | "next" | "summary"

export function DemoExperience() {
  const [position, setPosition] = useState(-1)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const statusId = useId()
  const stage = stageForPosition(position)
  const summaryOpen = position >= DEMO_SUMMARY_INDEX
  const beat = position >= 0 && position < DEMO_SUMMARY_INDEX ? demoBeats[position] : null

  useEffect(() => {
    const target = pendingFocus.current
    pendingFocus.current = null
    if (target === "start") startRef.current?.focus()
    if (target === "next") nextRef.current?.focus()
    if (target === "summary") summaryRef.current?.focus()
  }, [position])

  function start() {
    pendingFocus.current = "next"
    setPosition(0)
  }

  function advance() {
    setPosition((current) => {
      if (current >= DEMO_SUMMARY_INDEX) return current
      const next = nextDemoPosition(current)
      if (next >= DEMO_SUMMARY_INDEX) pendingFocus.current = "summary"
      return next
    })
  }

  function retreat() {
    setPosition((current) => previousDemoPosition(current))
  }

  function replay() {
    pendingFocus.current = "start"
    setPosition(-1)
  }

  function showSummary() {
    pendingFocus.current = "summary"
    setPosition(DEMO_SUMMARY_INDEX)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.target instanceof HTMLElement && event.target.closest("a")) return
    if (event.key === "ArrowRight") {
      event.preventDefault()
      if (position >= DEMO_SUMMARY_INDEX) return
      if (position < 0) start()
      else advance()
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      retreat()
    }
  }

  const progress =
    position < 0
      ? "Ready to start"
      : summaryOpen
        ? "Lead summary"
        : `Step ${position + 1} of ${DEMO_SUMMARY_INDEX}`

  return (
    <section
      className={styles.player}
      aria-labelledby="demo-player-title"
      data-script-version={DEMO_SCRIPT_VERSION}
      onKeyDown={onKeyDown}
    >
      <div className={styles.rail}>
        <h2 id="demo-player-title" className={styles.playerTitle}>
          {demoPageCopy.playerTitle}
        </h2>
        <p className={styles.progress}>{progress}</p>
        <ol className={styles.stages} aria-label="Example stages">
          {demoStages.map((item) => (
            <li key={item.id} aria-current={stage === item.id ? "step" : undefined}>
              {item.label}
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.stage}>
        <p id={statusId} className={styles.liveStatus} aria-live="polite" aria-atomic="true">
          {demoLiveStatus(position)}
        </p>

        {beat?.kind === "scene" ? (
          <article className={styles.beat} aria-labelledby={`beat-${beat.id}`}>
            <p className={styles.sceneKicker}>What is happening</p>
            <h3 id={`beat-${beat.id}`} className={styles.sceneTitle}>
              {beat.title}
            </h3>
            <p className={styles.sceneBody}>{beat.body}</p>
          </article>
        ) : null}

        {beat?.kind === "line" ? (
          <article className={`${styles.beat} ${beat.speaker === "caller" ? styles.callerBeat : styles.telloyaBeat}`}>
            <p className={styles.speaker}>
              {beat.speaker === "telloya" ? "Telloya" : "Alex Rowan"}
              <span>{beat.speaker === "telloya" ? "AI receptionist in this example" : "Fictional caller"}</span>
            </p>
            <p className={styles.line}>{beat.text}</p>
          </article>
        ) : null}

        {position < 0 ? (
          <article className={styles.beat}>
            <p className={styles.sceneKicker}>Before you start</p>
            <h3 className={styles.sceneTitle}>A fixed script, one step at a time</h3>
            <p className={styles.sceneBody}>
              Start the sample, move forward or back, or open the lead summary. Replaying returns to this introduction. Arrow keys do the same while a sample button is focused.
            </p>
          </article>
        ) : null}

        {summaryOpen ? (
          <article className={styles.summary} aria-labelledby="demo-summary-title">
            <p className={styles.sceneKicker}>For the business</p>
            <h3 id="demo-summary-title" ref={summaryRef} tabIndex={-1} className={styles.sceneTitle}>
              Lead summary for {demoLead.business}
            </h3>
            <p className={styles.summaryNote}>
              Fictional example for {demoLead.caller}. No visit is booked, and this summary has not been saved.
            </p>
            <dl className={styles.summaryList}>
              <div>
                <dt>Service requested</dt>
                <dd>{demoLead.serviceRequested}</dd>
              </div>
              <div>
                <dt>Problem</dt>
                <dd>{demoLead.problem}</dd>
              </div>
              <div>
                <dt>Approximate location</dt>
                <dd>{demoLead.approximateLocation}</dd>
              </div>
              <div>
                <dt>Callback number</dt>
                <dd>{demoLead.callbackNumberStatus}</dd>
              </div>
              <div>
                <dt>Preferred callback window</dt>
                <dd>{demoLead.preferredCallbackWindow}</dd>
              </div>
            </dl>
          </article>
        ) : null}

        <div className={styles.controls} role="group" aria-label="Sample controls" aria-describedby={statusId}>
          <button ref={startRef} type="button" className={styles.primaryControl} onClick={start} disabled={position >= 0}>
            Start the sample
          </button>
          <button ref={nextRef} type="button" className={styles.primaryControl} onClick={advance} disabled={position < 0 || summaryOpen}>
            Next step
          </button>
          <button type="button" className={styles.secondaryControl} onClick={retreat} disabled={position <= 0}>
            Previous step
          </button>
          <button type="button" className={styles.secondaryControl} onClick={replay} disabled={position < 0}>
            Replay from the beginning
          </button>
          <button type="button" className={styles.secondaryControl} onClick={showSummary} disabled={summaryOpen}>
            View the lead summary
          </button>
        </div>
      </div>
    </section>
  )
}
