import { NATIVE_SOURCE, type RpcClient } from './client';
import { requireValue } from './errors';
import type { Booking, GuestBookingInput } from '../domain/types';

export function createGuestBookingService(rpc: RpcClient, id: () => string) {
  const validate = (phone: string, pin: string) => requireValue(/^01\d{8,9}$/.test(phone.replace(/\D/g, '')) && /^\d{4}$/.test(pin));
  return {
    create: async (input: GuestBookingInput) => {
      validate(input.phone, input.bookingPin);
      const result = await rpc.call<Booking>('pm_guest_booking_create_v2', {
        p_booking: { ...input, id: input.id || id(), status: '신규', guest: true }, p_page_url: NATIVE_SOURCE,
      });
      requireValue(result && typeof result.id === 'string', 'INVALID_RESPONSE'); return result;
    },
    lookup: async (phone: string, pin: string) => {
      validate(phone, pin); return rpc.call<Booking | null>('pm_guest_booking_lookup', { p_phone: phone, p_pin: pin });
    },
    cancel: async (id: string, phone: string, pin: string) => {
      validate(phone, pin); requireValue(id);
      return rpc.call<Booking>('pm_guest_booking_cancel', { p_phone: phone, p_pin: pin, p_booking_id: id });
    },
  };
}
