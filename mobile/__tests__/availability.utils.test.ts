import type { AvailabilitySlot } from '../src/api';
import { findSlotForTime, getAvailabilityDayKey } from '../src/utils/availability';

describe('availability utilities', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('findSlotForTime matches slots with timezone offsets', () => {
    const slots: AvailabilitySlot[] = [
      {
        start: '2025-11-20T18:00:00+04:00',
        end: '2025-11-20T19:30:00+04:00',
        available_table_ids: ['t1'],
        count: 1,
      },
    ];
    const match = findSlotForTime(slots, '2025-11-20', '18:00', 'Asia/Baku');
    expect(match).not.toBeNull();
    expect(match?.start).toBe(slots[0].start);
  });

  it('derives the availability day in the restaurant timezone', () => {
    const iso = '2025-11-20T00:30:00+04:00';
    const day = getAvailabilityDayKey(iso, 'Asia/Baku');
    expect(day).toBe('2025-11-20');
  });
});
