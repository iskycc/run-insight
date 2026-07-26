export const DEFAULT_LOCALE = 'zh-CN';
export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export type DateTimeInput = Date | string | number;

type FormatOptions = {
  locale?: string;
  timeZone?: string;
  fallback?: string;
};

type RelativeTimeOptions = {
  locale?: string;
  now?: DateTimeInput;
  fallback?: string;
};

function toValidDate(value: DateTimeInput): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveTimeZone(value = process.env.NEXT_PUBLIC_TIME_ZONE): string {
  const timeZone = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone }).format(0);
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function dateParts(
  value: DateTimeInput,
  options: FormatOptions,
  includeTime: boolean,
): Record<string, string> | null {
  const date = toValidDate(value);
  if (!date) return null;

  const formatter = new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    timeZone: resolveTimeZone(options.timeZone),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...(includeTime
      ? {
          hour: '2-digit' as const,
          minute: '2-digit' as const,
          hourCycle: 'h23' as const,
        }
      : {}),
  });

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function formatDate(value: DateTimeInput, options: FormatOptions = {}): string {
  const parts = dateParts(value, options, false);
  if (!parts) return options.fallback ?? '—';
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

export function formatDateTime(
  value: DateTimeInput,
  options: FormatOptions = {},
): string {
  const parts = dateParts(value, options, true);
  if (!parts) return options.fallback ?? '—';
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

export function formatRelativeTime(
  value: DateTimeInput,
  options: RelativeTimeOptions = {},
): string {
  const date = toValidDate(value);
  const now = toValidDate(options.now ?? Date.now());
  if (!date || !now) return options.fallback ?? '—';

  const seconds = (date.getTime() - now.getTime()) / 1_000;
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 45) return '刚刚';

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['week', 7 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  const [unit, divisor] =
    units.find(([, unitSeconds]) => absoluteSeconds >= unitSeconds) ??
    units[units.length - 1];
  const amount = Math.round(seconds / divisor);

  return new Intl.RelativeTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    numeric: 'always',
  }).format(amount, unit);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * HTML date/datetime-local inputs represent the user's local wall-clock value.
 * These helpers intentionally do not apply NEXT_PUBLIC_TIME_ZONE.
 */
export function toDateInputValue(value: DateTimeInput = new Date()): string {
  const date = toValidDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateTimeLocalValue(value: DateTimeInput = new Date()): string {
  const date = toValidDate(value);
  if (!date) return '';
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateTimeLocalToISOString(value: string): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '0'] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const date = new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
    parts[5],
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== parts[0] ||
    date.getMonth() !== parts[1] - 1 ||
    date.getDate() !== parts[2] ||
    date.getHours() !== parts[3] ||
    date.getMinutes() !== parts[4] ||
    date.getSeconds() !== parts[5]
  ) {
    return null;
  }

  return date.toISOString();
}
