import type { AvailabilitySlot } from '../api';

export const DEFAULT_TIMEZONE = 'Asia/Baku';

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

type FormatterBundle = {
  parts: Intl.DateTimeFormat;
  time24: Intl.DateTimeFormat;
  date: Intl.DateTimeFormat;
  displayDate: Intl.DateTimeFormat;
  displayTime: Intl.DateTimeFormat;
  displayTimeWithZone: Intl.DateTimeFormat;
};

const formatterCache = new Map<string, FormatterBundle>();

const getFormatters = (timezone?: string): FormatterBundle => {
  const tz = timezone || DEFAULT_TIMEZONE;
  if (!formatterCache.has(tz)) {
    formatterCache.set(tz, {
      parts: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      time24: new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      date: new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
      }),
      displayDate: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      displayTime: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
      }),
      displayTimeWithZone: new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }),
    });
  }
  return formatterCache.get(tz)!;
};

const getZonedParts = (date: Date, timezone?: string): ZonedParts => {
  const formatted = getFormatters(timezone).parts.formatToParts(date);
  const map: Record<string, string> = {};
  formatted.forEach(({ type, value }) => {
    if (type !== 'literal') {
      map[type] = value;
    }
  });
  return map as ZonedParts;
};

const getZonedTimestamp = (date: Date, timezone?: string) => {
  const parts = getZonedParts(date, timezone);
  const timestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return { timestamp, parts };
};

const getZonedTimestampFromSelection = (dateStr: string, timeStr: string, timezone?: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Create a "timezone-stripped" timestamp by treating the input as if it's in UTC
  // This matches what getZonedTimestamp does: it formats a real timestamp in a timezone,
  // then treats those formatted numbers as UTC for comparison purposes
  return Date.UTC(year, month - 1, day, hour, minute, 0);
};

export const findSlotForTime = (
  slots: AvailabilitySlot[],
  dateStr: string,
  timeStr: string | null,
  timezone?: string,
): AvailabilitySlot | null => {
  if (!timeStr) return null;
  return (
    slots.find((slot) => {
      const { parts } = getZonedTimestamp(new Date(slot.start), timezone);
      const slotDate = `${parts.year}-${parts.month}-${parts.day}`;
      const slotTime = getFormatters(timezone).time24.format(new Date(slot.start));
      return slotDate === dateStr && slotTime === timeStr;
    }) ?? null
  );
};

export const getSuggestedSlots = (
  slots: AvailabilitySlot[],
  targetTimestamp: number | null,
  limit = 4,
  timezone?: string,
): AvailabilitySlot[] => {
  if (!slots.length) {
    return [];
  }
  const enriched = slots.map((slot) => {
    const { timestamp } = getZonedTimestamp(new Date(slot.start), timezone);
    return { timestamp, slot };
  });

  const sorted = enriched.sort((a, b) => a.timestamp - b.timestamp);
  if (targetTimestamp == null) {
    return sorted.slice(0, limit).map(({ slot }) => slot);
  }

  return sorted
    .sort(
      (a, b) =>
        Math.abs(a.timestamp - targetTimestamp) - Math.abs(b.timestamp - targetTimestamp),
    )
    .slice(0, limit)
    .map(({ slot }) => slot);
};

export const getDateString = (date: Date, timezone?: string) => getFormatters(timezone).date.format(date);

export const getTimeString = (date: Date, timezone?: string) =>
  getFormatters(timezone).time24.format(date);

export const getSelectionTimestamp = (dateStr: string, timeStr: string | null, timezone?: string) =>
  timeStr ? getZonedTimestampFromSelection(dateStr, timeStr, timezone) : null;

export const getAvailabilityDayKey = (isoString: string, timezone?: string) => {
  if (!isoString) {
    return '';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return getDateString(date, timezone);
};

export const formatDateLabel = (date: Date, timezone?: string) =>
  getFormatters(timezone).displayDate.format(date);

export const formatTimeLabel = (date: Date, timezone?: string) => {
  const formatter = getFormatters(timezone).displayTimeWithZone;
  const parts = formatter.formatToParts(date);
  let timeText = '';
  let zoneText = '';
  parts.forEach((part) => {
    if (part.type === 'timeZoneName') {
      zoneText = part.value.trim();
    } else {
      timeText += part.value;
    }
  });
  const trimmedTime = timeText.trim();
  return zoneText ? `${trimmedTime} ${zoneText}` : trimmedTime;
};
