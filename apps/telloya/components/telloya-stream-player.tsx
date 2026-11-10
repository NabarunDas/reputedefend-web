"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Play } from "lucide-react"
import { telloyaStreamPlayer } from "@/lib/telloya-stream"
import styles from "./telloya-stream-player.module.css"

const defaultPoster = {
  src: "/brand/telloya-cinematic-console.webp",
  mobileSrc: "/brand/telloya-cinematic-console-mobile.webp",
  width: 1672,
  height: 604,
}

type TelloyaStreamPoster = {
  src: string
  width: number
  height: number
  mobileSrc?: string
}

export function TelloyaStreamPlayer({
  poster = defaultPoster,
  description = telloyaStreamPlayer.description,
  descriptionPlacement = "before",
  emphasizePlay = false,
  framed = false,
}: {
  poster?: TelloyaStreamPoster
  description?: string
  descriptionPlacement?: "before" | "after"
  emphasizePlay?: boolean
  framed?: boolean
} = {}) {
  const [active, setActive] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const descriptionId = useId()
  const descriptionNode = (
    <p id={descriptionId} className={descriptionPlacement === "after" ? styles.descriptionAfter : styles.description}>
      {description}
    </p>
  )

  useEffect(() => {
    if (active) frameRef.current?.focus()
  }, [active])

  return (
    <div className={framed ? styles.card : styles.player}>
      {framed ? <p className={styles.kicker}>Featured demonstration</p> : null}
      {descriptionPlacement === "before" ? descriptionNode : null}
      <div className={styles.shell}>
        {active ? (
          <iframe
            ref={frameRef}
            className={styles.frame}
            src={telloyaStreamPlayer.playbackSrc}
            title={telloyaStreamPlayer.title}
            aria-describedby={descriptionId}
            allow={telloyaStreamPlayer.allow}
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className={styles.activate}
            aria-describedby={descriptionId}
            onClick={() => setActive(true)}
          >
            <picture>
              {poster.mobileSrc ? <source media="(max-width: 639px)" srcSet={poster.mobileSrc} /> : null}
              <img
                className={styles.poster}
                src={poster.src}
                alt=""
                width={poster.width}
                height={poster.height}
              />
            </picture>
            <span className={emphasizePlay ? `${styles.play} ${styles.playStrong}` : styles.play} aria-hidden="true">
              <Play size={22} />
              Play
            </span>
            <span className={styles.visuallyHidden}>{telloyaStreamPlayer.playLabel}</span>
          </button>
        )}
      </div>
      {framed && !active ? <p className={styles.hint}>Click to play the demonstration video</p> : null}
      {descriptionPlacement === "after" ? descriptionNode : null}
    </div>
  )
}
