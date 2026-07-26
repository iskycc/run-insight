import Link from 'next/link';
import { SmileySad } from '@phosphor-icons/react/ssr';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-86px)] items-center justify-center px-4">
      <div className="bento-panel px-10 py-12 text-center">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[20px] bg-accent/10 text-accent">
          <SmileySad size={42} weight="duotone" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-6xl font-bold text-text-primary">404</h1>
        <p className="mb-6 text-lg text-text-secondary">
          页面不存在
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-[10px] bg-accent px-4 text-sm font-medium text-white
                     no-underline transition-colors hover:bg-accent-hover hover:no-underline"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
