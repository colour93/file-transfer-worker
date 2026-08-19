import { ArrowRight } from "lucide-react"

import { extractBracketedPin } from "@/app/sharing"
import type { TransferMode } from "@/app/public-transfer/types"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"

export function PinStep({
  mode,
  pin,
  error,
  pending,
  onPinChange,
  onNext,
}: {
  mode: TransferMode
  pin: string
  error: string
  pending: boolean
  onPinChange: (pin: string) => void
  onNext: () => void
}) {
  const isUpload = mode === "upload"
  return (
    <div className="flex w-full flex-col gap-8">
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="transfer-pin">
          {isUpload ? "上传授权码" : "取件码"}
        </FieldLabel>
        <InputOTP
          id="transfer-pin"
          maxLength={6}
          value={pin}
          onChange={(value) =>
            onPinChange(value.replace(/\D/g, "").slice(0, 6))
          }
          onPaste={(event) => {
            const pastedPin = extractBracketedPin(
              event.clipboardData.getData("text"),
            )
            if (!pastedPin) return
            event.preventDefault()
            onPinChange(pastedPin)
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-invalid={Boolean(error)}
          aria-label="六位数字码"
          containerClassName="w-full"
          autoFocus
          onComplete={onNext}
        >
          <InputOTPGroup className="w-full justify-between">
            {Array.from({ length: 6 }, (_, index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <Button
        type="button"
        variant={isUpload ? "default" : "outline"}
        className="h-11 w-full justify-between"
        disabled={pending || pin.length !== 6}
        onClick={onNext}
      >
        <span>{pending ? "正在查找" : "下一步"}</span>
        {pending ? <Spinner /> : <ArrowRight />}
      </Button>
    </div>
  )
}
