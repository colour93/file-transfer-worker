import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"

type Preference = "system" | "light" | "dark"
type ResolvedScheme = "light" | "dark"

const storageKey = "color-scheme"
const mediaQuery = "(prefers-color-scheme: dark)"

function storedPreference(): Preference {
  const value = localStorage.getItem(storageKey)
  return value === "light" || value === "dark" ? value : "system"
}

function resolve(preference: Preference): ResolvedScheme {
  if (preference !== "system") return preference
  return matchMedia(mediaQuery).matches ? "dark" : "light"
}

function apply(preference: Preference) {
  const scheme = resolve(preference)
  document.documentElement.classList.toggle("dark", scheme === "dark")
  document.documentElement.style.colorScheme = scheme
  return scheme
}

export function initializeColorScheme() {
  apply(storedPreference())
}

export function ColorSchemeButton() {
  const [preference, setPreference] = useState<Preference>(storedPreference)
  const [scheme, setScheme] = useState<ResolvedScheme>(() => resolve(preference))

  useEffect(() => {
    setScheme(apply(preference))
    if (preference === "system") localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, preference)

    if (preference !== "system") return
    const media = matchMedia(mediaQuery)
    const update = () => setScheme(apply("system"))
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [preference])

  const label = preference === "system" ? "配色：跟随系统" : preference === "light" ? "配色：浅色" : "配色：深色"
  const Icon = preference === "system" ? Monitor : scheme === "dark" ? Moon : Sun

  function cycle() {
    setPreference((current) => current === "system" ? (scheme === "dark" ? "light" : "dark") : current === "light" ? "dark" : "system")
  }

  return <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={cycle}><Icon /></Button>
}
