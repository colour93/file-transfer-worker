import { useState } from "react";
import { motion } from "motion/react";
import { Download, Eye, File, Files } from "lucide-react";

import { formatBytes, type TransferManifest } from "@/app/api";
import { FilePreview, previewKind } from "@/app/public-transfer/file-preview";
import type { PreviewFile } from "@/app/public-transfer/types";
import { Button } from "@/components/ui/button";

export function DownloadFilesStep({
  manifest,
  onDownloadAll,
}: {
  manifest: TransferManifest;
  onDownloadAll: () => void;
}) {
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">下载文件</h1>
            <p className="text-sm text-muted-foreground">
              {manifest.files.length} 个文件
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onDownloadAll}>
          <Download />
          全部下载
        </Button>
      </div>
      <div className="flex flex-col divide-y border-y">
        {manifest.files.map((file, index) => {
          const canPreview = Boolean(previewKind(file));
          return (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.045 }}
              className="flex min-h-20 items-center gap-3 py-3"
            >
              <File className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                </div>
              </div>
              <div className="flex w-22 shrink-0 flex-col gap-1">
                {canPreview ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="justify-start"
                    onClick={() => setPreview(file)}
                  >
                    <Eye />
                    在线预览
                  </Button>
                ) : null}
                <Button
                  asChild
                  variant={canPreview ? "ghost" : "outline"}
                  size="xs"
                  className="justify-start"
                >
                  <a href={file.url}>
                    <Download />
                    下载
                  </a>
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        有效至 {new Date(manifest.expiresAt * 1000).toLocaleString()}
      </p>
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
