import { ArrowDown, ArrowUp } from "lucide-react";

import type { TransferMode } from "@/app/public-transfer/types";
import { Button } from "@/components/ui/button";

const modes = [
  { mode: "upload", label: "存", icon: ArrowUp, variant: "default" },
  { mode: "download", label: "取", icon: ArrowDown, variant: "outline" },
] as const;

export function ModeSelector({
  onSelect,
}: {
  onSelect: (mode: TransferMode) => void;
}) {
  return (
    <div className="flex w-full gap-3 justify-between">
      {modes.map(({ mode, label, icon: Icon, variant }) => (
        <Button
          key={mode}
          variant={variant}
          className="h-11 flex-1 justify-between"
          onClick={() => onSelect(mode)}
        >
          <span>{label}</span>
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
