import type { SVGProps } from "react"

type LogoProps = SVGProps<SVGSVGElement> & {
  variant?: "dark" | "light" | "mono"
  markOnly?: boolean
}

const colors = {
  dark: { ink: "#123c32", accent: "#2f9d68", text: "#123c32" },
  light: { ink: "#f7fbf4", accent: "#c7f36b", text: "#f7fbf4" },
  mono: { ink: "currentColor", accent: "currentColor", text: "currentColor" },
}

function MarkPaths({ variant = "dark" }: { variant?: LogoProps["variant"] }) {
  const palette = colors[variant ?? "dark"]
  return (
    <>
      <path d="M14 17.5A5.5 5.5 0 0 1 19.5 12h23A5.5 5.5 0 0 1 48 17.5v14.2c0 3.04-1.23 5.95-3.42 8.07L32 52 19.42 39.77A11.16 11.16 0 0 1 16 31.7V20.5" fill="none" stroke={palette.ink} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27" cy="25" r="4.2" fill={palette.accent} />
      <path d="M27 32.5c-4.8 0-8 2.35-8 5.8h16c0-3.45-3.2-5.8-8-5.8Zm11-7.5h7m-7 6h5" fill="none" stroke={palette.accent} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M8 39.5c6 10 17.1 16.1 29.3 15.2 8.1-.6 14.8-4.3 19.1-10.1" fill="none" stroke={palette.accent} strokeWidth="3.2" strokeLinecap="round" />
    </>
  )
}

export function ReputeMark({ variant = "dark", ...props }: Omit<LogoProps, "markOnly">) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="ReputeDefend mark" {...props}>
      <MarkPaths variant={variant} />
    </svg>
  )
}

export function ReputeLogo({ variant = "dark", markOnly = false, className, ...props }: LogoProps) {
  const palette = colors[variant]
  if (markOnly) return <ReputeMark variant={variant} className={className} {...props} />
  return (
    <svg viewBox="0 0 280 64" role="img" aria-label="ReputeDefend" preserveAspectRatio="xMinYMid meet" className={className} {...props}>
      <g transform="translate(0 0)" aria-hidden="true">
        <MarkPaths variant={variant} />
      </g>
      <text x="76" y="42" fill={palette.text} fontFamily="Arial, sans-serif" fontSize="27" fontWeight="700" letterSpacing="-1.8">
        Repute<tspan fill={palette.accent}>Defend</tspan>
      </text>
    </svg>
  )
}
