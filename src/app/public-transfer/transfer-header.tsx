import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, FolderOpen } from "lucide-react";

import { ColorSchemeButton } from "@/app/color-scheme";
import { Button } from "@/components/ui/button";

export function TransferHeader({
  title,
  canGoBack,
  onBack,
}: {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between bg-background/90 px-3 backdrop-blur-sm sm:px-5">
      <AnimatePresence mode="wait" initial={false}>
        {canGoBack ? (
          <motion.div
            key="back"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="返回"
              title="返回"
            >
              <ArrowLeft />
            </Button>
          </motion.div>
        ) : (
          <motion.span
            key="title"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="px-2 text-sm font-medium"
          >
            {title}
          </motion.span>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-1">
        <ColorSchemeButton />
        <Button asChild variant="ghost" size="icon-sm">
          <a href="/admin" aria-label="管理" title="管理">
            <FolderOpen />
          </a>
        </Button>
      </div>
    </header>
  );
}
