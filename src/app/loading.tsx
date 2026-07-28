import { LoadingState } from '@/components/shared/LoadingState';

export default function Loading() {
  return (
    <div className="page-shell loading-state-enter">
      <div className="mb-7 space-y-3" aria-hidden="true">
        <div className="skeleton-line h-8 w-52 rounded-lg" />
        <div className="skeleton-line h-4 w-full max-w-xl rounded-full" />
      </div>
      <LoadingState label="正在准备页面内容" rows={5} />
    </div>
  );
}
