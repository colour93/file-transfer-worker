import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import { initializeColorScheme } from "@/app/color-scheme"
import "@/app/styles.css"

initializeColorScheme()

const Page = location.pathname.startsWith("/admin")
  ? lazy(() =>
      import("@/app/admin-page").then((module) => ({
        default: module.AdminPage,
      })),
    )
  : lazy(() =>
      import("@/app/public-page").then((module) => ({
        default: module.PublicPage,
      })),
    )

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <main className="grid min-h-svh place-items-center text-sm text-muted-foreground">
          加载中…
        </main>
      }
    >
      <Page />
    </Suspense>
  </StrictMode>,
)
