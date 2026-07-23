import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center px-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-xl bg-accent/10 mb-lg">
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
        <h1 className="text-6xl font-bold text-text-primary mb-sm">404</h1>
        <p className="text-lg text-text-secondary mb-lg">
          页面不存在
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-md py-sm text-sm font-medium text-white
                     bg-accent rounded-md hover:bg-accent-hover transition-colors no-underline"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
