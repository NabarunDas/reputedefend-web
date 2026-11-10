"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Play } from "lucide-react"
import { telloyaStreamPlayer } from "@/lib/telloya-stream"
import styles from "./telloya-stream-player.module.css"

const desktopPoster = "/brand/telloya-cinematic-console.webp"
const mobilePoster = "/brand/telloya-cinematic-console-mobile.webp"

export function TelloyaStreamPlayer() {
  const [active, setActive] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const descriptionId = useId()

  useEffect(() => {
    if (active) frameRef.current?.focus()
  }, [active])

  return (
    <div className={styles.player}>
      <p id={descriptionId} className={styles.description}>{telloyaStreamPlayer.description}</p>
      <div className={styles.shell}>
        {active ? (
          <iframe
            ref={frameRef}
            className={styles.frame}
            src={telloyaStreamPlayer.iframeSrc}
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
              <source media="(max-width: 639px)" srcSet={mobilePoster} />
              <img
                className={styles.poster}
                src={desktopPoster}
                alt=""
                width={1672}
                height={604}
              />
            </picture>
            <span className={styles.play} aria-hidden="true">
              <Play size={22} />
              Play
            </span>
            <span className={styles.visuallyHidden}>{telloyaStreamPlayer.playLabel}</span>
          </button>
        )}
      </div>
    </div>
  )
}
