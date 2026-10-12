/* Mirrors server-authorized state; deep links are rechecked by the booking RPC. */
export function attachBookingDevice(bookings) {
  const cap = window.Capacitor;
  const plugin = cap?.isNativePlatform?.() && cap.isPluginAvailable('BookingActivity') ? cap.registerPlugin('BookingActivity') : null;
  let signature = '', sequence = Promise.resolve();
  function snapshot() {
    const state = bookings.snapshot(), first = state.items[0] || state.upcoming[0];
    const time = String(first?.time || '00:00').slice(0, 5);
    const timestamp = Date.parse(`${String(first?.date || '').replaceAll('.', '-')}T${time}:00+09:00`);
    return { active: state.active && state.loaded, pendingCount: state.items.length, upcomingCount: state.upcoming.length,
      branch: first?.branch || '프로모터스', schedule: first ? `${first.date} · ${first.time}` : '', bookingId: String(first?.id || ''),
      startsAt: Number.isFinite(timestamp) ? timestamp / 1000 : 0 };
  }
  if (plugin) {
    plugin.addListener('bookingOpen', event => bookings.open(String(event.id)).catch(() => {}));
    plugin.addListener('activityToken', event => window.PMNativePush?.activityToken(event));
  }
  bookings.listen(() => {
    if (!plugin) return;
    const state = snapshot(), binding = window.PMNativePush?.binding;
    const next = JSON.stringify({ ...state, binding });
    if (signature === next) return;
    signature = next;
    sequence = sequence.catch(() => {}).then(async () => {
      if (!state.active || !binding || binding !== window.PMNativePush?.binding || !snapshot().active) await plugin.clear();
      else await plugin.sync({ ...state, binding });
    }).catch(() => { signature = ''; });
  });
}
