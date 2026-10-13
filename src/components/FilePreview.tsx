import { useEffect, useMemo, useState } from 'react';
import { FileQuestion, Download, Loader2 } from 'lucide-react';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml',
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Read-only view for binary files (base64 content): images and PDFs are shown, anything else gets a short
 * explanation and a download button. Binary files are never put in the text editor, so they cannot be saved
 * back as text by mistake.
 */
export function FilePreview({
  filePath,
  base64,
  onDownload,
  downloading,
}: {
  filePath: string;
  base64: string;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const imageType = IMAGE_TYPES[ext];
  const isPdf = ext === 'pdf';
  const bytes = Math.floor((base64.length * 3) / 4);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => setDims(null), [filePath]);

  // PDFs open from a blob URL (data: URLs are too large and are blocked in frames).
  const pdfUrl = useMemo(() => {
    if (!isPdf || !base64) return null;
    try {
      const bin = atob(base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([arr], { type: 'application/pdf' }));
    } catch {
      return null;
    }
  }, [isPdf, base64]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const name = filePath.split('/').pop() || filePath;
  const downloadButton = onDownload && (
    <button
      type="button"
      onClick={onDownload}
      disabled={downloading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-xs font-semibold text-text-primary hover:bg-bg-tertiary/60 disabled:opacity-50 cursor-pointer"
    >
      {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Download
    </button>
  );

  if (imageType) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-6 bg-[repeating-conic-gradient(rgba(128,128,128,0.12)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
          <img
            src={`data:${imageType};base64,${base64}`}
            alt={name}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="max-w-full max-h-full object-contain shadow-lg"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/30 text-[11px] text-text-secondary">
          <span>{dims ? `${dims.w} × ${dims.h} px · ` : ''}{formatSize(bytes)} · read-only preview</span>
          {downloadButton}
        </div>
      </div>
    );
  }

  if (isPdf && pdfUrl) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <iframe src={pdfUrl} title={name} className="flex-1 min-h-0 w-full border-0 bg-white" />
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/30 text-[11px] text-text-secondary">
          <span>{formatSize(bytes)} · read-only preview</span>
          {downloadButton}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center select-none">
      <div className="p-3 rounded-full bg-bg-tertiary/60 text-text-muted">
        <FileQuestion size={24} />
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-semibold text-text-primary">This is a binary file</h3>
        <p className="mt-1 text-xs text-text-secondary">
          {name} ({formatSize(bytes)}) is not text, so it can't be edited here. Download it to open it on your computer.
        </p>
      </div>
      {downloadButton}
    </div>
  );
}
