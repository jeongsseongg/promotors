import { createRpcClient, type ApiClientOptions } from './client';
import { createSessionService } from '../auth/session';
import { createPublicContentService } from './public';
import { createBookingService, createAdminBookingService } from './bookings';
import { createGuestBookingService } from './guest';
import { createAccountService } from './account';
import { createDeletionService } from './account-deletion';
import { createNotificationsService } from './notifications';
import type { NativePushPlatform, NotificationConnectionPreferences, SessionStorage } from '../domain/types';
import type { PhotoPicker } from '../domain/management';
import { createRepairPhotoAccess } from './repair-photos';
import { createAdminAccess } from './admin-access';
import { createAdminAssetsService } from './admin-assets';
import { createAdminWorkService } from './admin-work';
import { createAdminCustomersService } from './admin-customers';
import { createAdminContentService } from './admin-content';
import { createAdminPromotionsService } from './admin-promotions';
import { createAdminInquiriesService } from './admin-inquiries';

export interface NativeServicesOptions extends ApiClientOptions {
  storage: SessionStorage;
  push?: NativePushPlatform;
  deviceId?: () => Promise<string>;
  connectionPreferences?: NotificationConnectionPreferences;
  idFactory?: () => string;
  photoPicker?: PhotoPicker;
}
export function createNativeServices(options: NativeServicesOptions) {
  const rpc = createRpcClient(options);
  const session = createSessionService(rpc, options.storage);
  const id = options.idFactory || (() => `native-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const photos = createRepairPhotoAccess(session), admin = createAdminAccess(rpc, session);
  const bookingListeners = new Set<() => void>();
  const bookingChanged = () => { for (const listener of bookingListeners) { try { listener(); } catch {} } };
  const notifications = createNotificationsService(rpc, session, options.push, options.deviceId, bookingChanged, options.connectionPreferences);
  return { session, publicContent: createPublicContentService(rpc),
    bookings: createBookingService(rpc, session, id), adminBookings: createAdminBookingService(rpc, session, bookingChanged),
    guest: createGuestBookingService(rpc, id), account: createAccountService(rpc, session, id, photos),
    adminWork: createAdminWorkService(admin, id, bookingChanged), adminCustomers: createAdminCustomersService(admin, id),
    adminContent: createAdminContentService(admin), adminPromotions: createAdminPromotionsService(admin, id),
    adminAssets: createAdminAssetsService(admin, id, options.photoPicker, photos),
    adminInquiries: createAdminInquiriesService(admin, id),
    deletion: createDeletionService(rpc, session, options.storage), notifications,
    subscribeBookingChange(listener: () => void) { bookingListeners.add(listener); return () => { bookingListeners.delete(listener); }; },
    dispose: () => { bookingListeners.clear(); return notifications.dispose(); } };
}
export type NativeServices = ReturnType<typeof createNativeServices>;
