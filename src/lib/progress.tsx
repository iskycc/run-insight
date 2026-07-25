import { PROGRESS_LABELS, type ProgressCategory } from '@/types';

export type ProgressBadgeKey =
  | 'pending'
  | 'analyzing'
  | 'located'
  | 'fixed'
  | 'not-issue'
  | 'blocked';

export const PROGRESS_CATEGORY_TO_BADGE: Record<ProgressCategory, ProgressBadgeKey> = {
  PENDING: 'pending',
  ANALYZING: 'analyzing',
  LOCATED: 'located',
  FIXED: 'fixed',
  NOT_ISSUE: 'not-issue',
  BLOCKED: 'blocked',
};

export function isValidProgressCategory(category: string): category is ProgressCategory {
  return category in PROGRESS_CATEGORY_TO_BADGE;
}

export function getProgressBadgeKey(category: string | null | undefined): ProgressBadgeKey | null {
  if (!category) return null;
  return isValidProgressCategory(category) ? PROGRESS_CATEGORY_TO_BADGE[category] : null;
}

export function getProgressLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  return isValidProgressCategory(category) ? PROGRESS_LABELS[category] : null;
}

export function getProgressBadgeProps(
  category: string | null | undefined,
): { key: ProgressBadgeKey; label: string } | null {
  const key = getProgressBadgeKey(category);
  const label = getProgressLabel(category);
  if (!key || !label) return null;
  return { key, label };
}
