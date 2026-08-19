import { AnimatePresence, motion } from "motion/react"

import { DownloadFilesStep } from "@/app/public-transfer/download-files-step"
import { ModeSelector } from "@/app/public-transfer/mode-selector"
import { PinStep } from "@/app/public-transfer/pin-step"
import { TransferHeader } from "@/app/public-transfer/transfer-header"
import { UploadResultStep, UploadStep } from "@/app/public-transfer/upload-step"
import { useTransferFlow } from "@/app/public-transfer/use-transfer-flow"
import { useAppTitle } from "@/app/use-app-title"

const pageMotion = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -28 }),
}

export function PublicPage() {
  const title = useAppTitle()
  const flow = useTransferFlow()

  return (
    <main className="min-h-svh overflow-hidden px-5 sm:px-7">
      <TransferHeader
        title={title}
        canGoBack={flow.step !== "home"}
        onBack={flow.back}
      />
      <section
        className="relative mx-auto flex min-h-svh w-full max-w-md items-center py-24"
        aria-label="文件中转"
      >
        <AnimatePresence
          initial={false}
          mode="popLayout"
          custom={flow.direction}
        >
          <motion.div
            key={flow.step === "pin" ? `${flow.step}-${flow.mode}` : flow.step}
            custom={flow.direction}
            variants={pageMotion}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {flow.step === "home" ? (
              <ModeSelector onSelect={flow.selectMode} />
            ) : flow.step === "pin" && flow.mode ? (
              <PinStep
                mode={flow.mode}
                pin={flow.pin}
                error={flow.error}
                pending={flow.pending}
                onPinChange={flow.setPin}
                onNext={flow.submitPin}
              />
            ) : flow.step === "upload" ? (
              <UploadStep {...flow.uploadStepProps} />
            ) : flow.step === "upload-result" && flow.result ? (
              <UploadResultStep
                appTitle={title}
                result={flow.result}
                copied={flow.copied}
                onCopy={flow.copy}
                onDone={flow.reset}
              />
            ) : flow.step === "download-result" && flow.manifest ? (
              <DownloadFilesStep
                manifest={flow.manifest}
                onDownloadAll={flow.downloadAll}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  )
}
