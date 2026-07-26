'use client';

import { useCallback, useRef, useState } from 'react';

interface FileDropZoneProps {
  onFileAccepted: (file: File) => void;
  accept?: string;
}

export default function FileDropZone({ onFileAccepted, accept = '.csv,.json,.xlsx,.xls' }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
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
      onDragLeave={() => setIsDragging(false)}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="选择要导入的文件"
      className={`group flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-5 rounded-[22px] border-2 border-dashed p-8 text-center outline-none transition-all focus-visible:ring-4 focus-visible:ring-accent/15 ${
        isDragging
          ? 'border-accent bg-accent/5 shadow-[0_16px_38px_rgba(37,99,235,0.12)]'
          : 'border-slate-200 bg-[#f8faff] hover:border-accent/50 hover:bg-white hover:shadow-[0_16px_38px_rgba(15,23,42,0.08)]'
      }`}
    >
      <span className="rounded-full bg-accent/8 px-3 py-1.5 text-xs font-semibold text-accent">
        文件导入
      </span>
      <div className="text-center">
        <p className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
          {isDragging ? '松开即可上传' : '拖拽文件到这里'}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          或点击浏览文件，支持 CSV、JSON、Excel
        </p>
      </div>
      <span className="rounded-full border border-border bg-white px-4 py-2 text-xs font-semibold text-text-primary shadow-sm transition group-hover:border-accent/30 group-hover:text-accent">
        选择文件
      </span>
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
