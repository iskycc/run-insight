'use client';

import { useCallback, useRef } from 'react';

interface FileDropZoneProps {
  onFileAccepted: (file: File) => void;
  accept?: string;
}

export default function FileDropZone({ onFileAccepted, accept = '.csv,.json,.xlsx,.xls' }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => inputRef.current?.click()}
      className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-bg/60 p-8 transition hover:border-[var(--color-accent)] hover:bg-surface-solid"
    >
      <svg
        className="h-11 w-11 text-[var(--color-accent)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.7}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <div className="text-center">
        <p className="text-base font-semibold text-[var(--color-text-primary)]">
          拖拽文件到此处，或点击选择文件
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          支持 CSV、JSON、Excel .xlsx/.xls 格式
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
