import { brandName } from "@/lib/brand"

export const disclaimerSeo = {
  titlePage: "Disclaimer",
  description:
    "ProfileRelaunch is independent of Google. Profile reinstatement, review removal and platform timeframes are not guaranteed. Website information is not legal advice.",
} as const

export const disclaimerHero = {
  eyebrow: "Disclaimer",
  title: "Independent support, not Google.",
  lead: `${brandName} is independent of Google. We cannot guarantee reinstatement, review removal, ranking changes or any other platform outcome. Information on this website is practical guidance, not legal advice.`,
} as const

export const disclaimerInternational =
  `${brandName} supports businesses internationally, but that does not mean every Google process, jurisdiction or case can necessarily be supported.`
