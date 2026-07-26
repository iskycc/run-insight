export interface PublicBuildInfo {
  version: string;
  build: string;
}

const SAFE_BUILD_VALUE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

function safeBuildValue(
  candidates: Array<string | undefined>,
): string {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && SAFE_BUILD_VALUE.test(value)) return value;
  }
  return "unknown";
}

export function getPublicBuildInfo(): PublicBuildInfo {
  return {
    version: safeBuildValue([
      process.env.NEXT_PUBLIC_APP_VERSION,
      process.env.APP_VERSION,
      process.env.npm_package_version,
    ]),
    build: safeBuildValue([
      process.env.BUILD_ID,
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
      process.env.GIT_COMMIT_SHA?.slice(0, 12),
    ]),
  };
}
