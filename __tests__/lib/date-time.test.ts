import {
  DEFAULT_TIME_ZONE,
  dateTimeLocalToISOString,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  resolveTimeZone,
  toDateInputValue,
  toDateTimeLocalValue,
} from '@/lib/date-time';

describe('date-time', () => {
  it('uses the configured display timezone with a safe fallback', () => {
    expect(resolveTimeZone('UTC')).toBe('UTC');
    expect(resolveTimeZone('Not/A-Time-Zone')).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE);
  });

  it('formats dates and datetimes consistently in Asia/Shanghai', () => {
    const value = '2026-07-26T16:30:00.000Z';

    expect(formatDate(value)).toBe('2026年7月27日');
    expect(formatDateTime(value)).toBe('2026年7月27日 00:30');
    expect(formatDateTime(value, { timeZone: 'UTC' })).toBe('2026年7月26日 16:30');
  });

  it('returns a safe placeholder for invalid values', () => {
    expect(formatDate('invalid')).toBe('—');
    expect(formatDateTime('invalid', { fallback: '时间未知' })).toBe('时间未知');
    expect(formatRelativeTime('invalid')).toBe('—');
  });

  it('formats relative time against an explicit reference time', () => {
    const now = '2026-07-27T08:00:00.000Z';

    expect(formatRelativeTime('2026-07-27T07:00:00.000Z', { now })).toBe('1小时前');
    expect(formatRelativeTime('2026-07-29T08:00:00.000Z', { now })).toBe('2天后');
    expect(formatRelativeTime('2026-07-27T07:59:40.000Z', { now })).toBe('刚刚');
  });

  it('keeps HTML input values in the user local wall-clock timezone', () => {
    const localDate = new Date(2026, 6, 7, 10, 5);

    expect(toDateInputValue(localDate)).toBe('2026-07-07');
    expect(toDateTimeLocalValue(localDate)).toBe('2026-07-07T10:05');
    expect(dateTimeLocalToISOString('2026-07-07T10:05')).toBe(localDate.toISOString());
    expect(dateTimeLocalToISOString('2026-02-30T10:05')).toBeNull();
    expect(dateTimeLocalToISOString('not-a-date')).toBeNull();
  });
});
