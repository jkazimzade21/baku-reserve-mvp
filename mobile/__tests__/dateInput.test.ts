import { formatDateInput, parseDateInput } from '../src/utils/dateInput';

describe('dateInput helpers', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Asia/Baku';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('round-trips YYYY-MM-DD strings in Asia/Baku timezone', () => {
    const input = '2025-11-20';
    const parsed = parseDateInput(input);
    expect(parsed).not.toBeNull();
    expect(formatDateInput(parsed!)).toBe(input);
  });

  it('rejects invalid date formats', () => {
    expect(parseDateInput('2025/11/20')).toBeNull();
    expect(parseDateInput('invalid')).toBeNull();
  });
});
