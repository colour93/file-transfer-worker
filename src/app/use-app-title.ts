import { useEffect, useState } from "react"

import { request } from "@/app/api"

export function useAppTitle() {
  const [title, setTitle] = useState("Transfer")
  useEffect(() => {
    request<{ title: string }>("/api/config").then(({ title: value }) => {
      setTitle(value)
      document.title = value
    }).catch(() => undefined)
  }, [])
  return title
}
