import { createRpcClient, type ApiClientOptions } from './client';
import { createSessionService } from '../auth/session';
import { createPublicContentService } from './public';
import { createBookingService, createAdminBookingService } from './bookings';
import { createGuestBookingService } from './guest';
import { createAccountService } from './account';
import { createDeletionService } from './account-deletion';
import { createNotificationsService } from './notifications';
import type { NativePushPlatform, SessionStorage } from '../domain/types';
import type { PhotoPicker } from '../domain/management';

export interface NativeServicesOptions extends ApiClientOptions {
  storage: SessionStorage;
  push?: NativePushPlatform;
  deviceId?: () => Promise<string>;
  idFactory?: () => string;
  photoPicker?: PhotoPicker;
}
export function createNativeServices(options: NativeServicesOptions) {
  const rpc = createRpcClient(options);
  const session = createSessionService(rpc, options.storage);
  const id = options.idFactory || (() => `native-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const notifications = createNotificationsService(rpc, session, options.push, options.deviceId);
  return { session, publicContent: createPublicContentService(rpc),
    bookings: createBookingService(rpc, session, id), adminBookings: createAdminBookingService(rpc, session),
    guest: createGuestBookingService(rpc, id), account: createAccountService(rpc, session, id),
    deletion: createDeletionService(rpc, session, options.storage), notifications,
    dispose: () => notifications.dispose() };
}
export type NativeServices = ReturnType<typeof createNativeServices>;
