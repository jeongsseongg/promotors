import type { AvailableSlot, BranchHours, OccupiedSlot } from './types';

export const BOOKING_TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
export function availableSlots(hours: BranchHours, branch: string, date: string, occupied: OccupiedSlot[], now = Date.now()): AvailableSlot[] {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date);
  const stamp = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
  const validDate = Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10).replace(/-/g, '.') === date;
  const schedule = hours[branch];
  const day = validDate ? schedule?.days?.[String(new Date(stamp).getUTCDay())] : undefined;
  return BOOKING_TIMES.map(time => {
    let reason: string | undefined;
    if (!validDate || !schedule || !day || !/^\d{2}:\d{2}$/.test(day.start || '') || !/^\d{2}:\d{2}$/.test(day.end || '')) reason = '예약 시간 확인 필요';
    else if (!day.open || schedule.closedDates?.includes(date)) reason = '휴무';
    else if (time < day.start || time >= day.end) reason = '영업시간 외';
    else if (schedule.lunchEnabled && time >= String(schedule.lunchStart || '12:00') && time < String(schedule.lunchEnd || '13:00')) reason = '점심시간';
    else if (Date.parse(`${date.replace(/\./g, '-')}T${time}:00+09:00`) <= now) reason = '지난 시간';
    else if (occupied.some(slot => slot.date === date && slot.time === time)) reason = '예약 완료';
    return { time, available: !reason, ...(reason ? { reason } : {}) };
  });
}
