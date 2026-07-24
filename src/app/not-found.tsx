import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-104px)] items-center justify-center px-md">
      <div className="panel px-10 py-12 text-center">
        <div className="mb-lg inline-flex h-20 w-20 items-center justify-center rounded-md bg-accent/10">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </div>
        <h1 className="mb-sm text-6xl font-bold text-text-primary">404</h1>
        <p className="mb-lg text-lg text-text-secondary">
          页面不存在
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md bg-accent px-md text-sm font-medium text-white
                     no-underline transition-colors hover:bg-accent-hover hover:no-underline"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
