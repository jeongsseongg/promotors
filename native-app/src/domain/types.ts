export type Role = 'customer' | 'general' | 'main' | 'developer';
export type JsonRecord = Record<string, unknown>;
export type Permission = 'default' | 'granted' | 'denied';

export interface MemberProfile extends JsonRecord {
  id: string; name?: string; model?: string; car?: string; phone?: string;
  email?: string; address?: string; birthday?: string;
}
export interface Branch extends JsonRecord {
  id?: string; name: string; addr?: string; tel?: string; mobile?: string;
  map?: string; imageKey?: string; imageKeys?: string[];
}
export interface PublicPost extends JsonRecord {
  id?: string | number; title: string; body?: string; bodyHtml?: string;
  date?: string; branch?: string; model?: string; imageKeys?: string[]; status?: string;
  imageUrls?: string[]; sourceUrl?: string;
}
export interface IntroSlide extends JsonRecord { key: string; alt?: string }
export interface PublicContent {
  branches: Branch[]; cases: PublicPost[]; notices: PublicPost[];
  introSlides: IntroSlide[]; products: JsonRecord[]; eventBanners: JsonRecord[];
  caseFeedErrors?: string[];
}
export interface Booking extends JsonRecord {
  id: string; branch: string; date: string; time: string; status: string;
  memberId?: string; guest?: boolean; name?: string; phone?: string;
  car?: string; model?: string; services?: string[]; memo?: string;
  mileage?: number | string; createdAt?: string; cancelledAt?: string; cancelledBy?: string;
}
export interface BookingInput {
  id?: string; branch: string; date: string; time: string; services: string[];
  memo?: string; couponAssignmentId?: string; couponName?: string;
}
export interface GuestBookingInput extends BookingInput {
  name: string; phone: string; car: string; model: string; bookingPin: string;
}
export interface BranchDay { open: boolean; start: string; end: string }
export interface BranchSchedule extends JsonRecord {
  days: Record<string, BranchDay>; lunchEnabled?: boolean;
  lunchStart?: string; lunchEnd?: string; closedDates?: string[];
}
export type BranchHours = Record<string, BranchSchedule>;
export interface OccupiedSlot { date: string; time: string }
export interface AvailableSlot { time: string; available: boolean; reason?: string }
export interface ServiceRun extends JsonRecord {
  id: string; branch?: string; memberId?: string; customer?: MemberProfile;
  service?: string; status?: string; bookingDate?: string; bookingTime?: string; mileage?: number | string;
}
export interface Inquiry extends JsonRecord {
  id: string; memberId?: string; from: 'customer' | 'admin'; message: string;
  createdAt?: string; customer?: MemberProfile;
}
export interface AccountContent {
  profile: MemberProfile | null; bookings: Booking[]; runs: ServiceRun[]; messages: Inquiry[];
}
export interface Promotions {
  coupons: JsonRecord[]; assignments: JsonRecord[]; couponUsage: JsonRecord[];
  events: JsonRecord[]; entries: JsonRecord[];
}
export interface CustomerContext extends JsonRecord {
  existing: boolean; limited?: boolean; matchKind?: string;
  bookings: JsonRecord[]; runs: JsonRecord[]; audit: JsonRecord[];
  memos: JsonRecord[]; records: JsonRecord[];
}
export interface AdminBookingDetail { booking: Booking; customerContext?: CustomerContext }
export interface AdminBookingQueue { items: Booking[]; upcoming: Booking[] }
export interface BookingActionResult extends AdminBookingDetail { changed: boolean }
export interface NotificationPreferences {
  enabled: boolean; booking: boolean; repair: boolean; reminders: boolean; marketing: boolean;
  marketing_consent_at?: string | null;
}
export interface NotificationTarget extends JsonRecord {
  kind: 'booking' | 'bookingSchedule' | 'repair' | 'inquiry' | 'events' | 'inbox'; id?: string; branch?: string;
  action?: 'accept' | 'reject';
}
export interface NativeBookingSnapshot {
  active: boolean; binding: string; pendingCount: number; upcomingCount: number;
  branch: string; schedule: string; bookingId: string; startsAt: number;
  customerName: string; vehicleName: string; vehiclePlate: string;
  audience?: 'customer'; phase?: 'confirmed' | 'visit' | 'repair' | 'completed' | 'cancelled';
  runId?: string; stageLabel?: string; progress?: number; expiresAt?: number;
}
export interface InboxItem extends JsonRecord {
  id: string; category: string; title: string; body: string; created_at: string;
  read_at?: string | null; target?: NotificationTarget;
}
export interface NotificationState {
  preferences: NotificationPreferences; items: InboxItem[]; admin: boolean;
  canViewLogs?: boolean; maintenanceDate?: string | null;
}
export interface NotificationOpenTarget {
  notificationId?: string; bookingId?: string; runId?: string; binding: string; action?: 'accept' | 'reject'; trustedAction?: boolean;
}
export interface NativePushPlatform {
  platform: 'ios' | 'android';
  permission(): Promise<Permission>;
  requestPermission(): Promise<Permission>;
  getToken(): Promise<string>;
  bind(binding: string): Promise<void>;
  clear(): Promise<void>;
  onOpen(listener: (target: NotificationOpenTarget) => void): () => void;
  getInitialTarget(): Promise<NotificationOpenTarget | null>;
}
export interface NotificationConnectionPreferences {
  allowed(ownerKey: string): Promise<boolean>;
  save(ownerKey: string, allowed: boolean): Promise<void>;
}
export interface PushConnection {
  supported: boolean; permission: Permission; enabled: boolean; connected: boolean; automatic: boolean;
}
export type DeletionStatus = 'none' | 'pending' | 'processing' | 'needs_review' | 'cancelled' | 'completed';
export interface DeletionState {
  status: DeletionStatus; canCancel: boolean; requestedAt?: string;
  scheduledFor?: string; completedAt?: string; receipt?: string;
}
export interface AuthContext {
  authenticated: boolean; role?: Role; branches?: string[]; profile?: MemberProfile | null;
}
export interface SyncRow { data_key: string; payload: unknown }
export interface SyncSnapshot { rows: SyncRow[]; context: AuthContext; epoch: number }
export interface SessionSnapshot {
  status: 'signedOut' | 'restoring' | 'signedIn'; authenticated: boolean;
  role: Role | null; branches: string[]; profile: MemberProfile | null;
  expiresAt: string | null; privacyEpoch: number | null; deletionPending: boolean; revision: number;
}
export interface StoredSession { token: string; expiresAt?: string | null; privacyEpoch?: number }
export interface SessionStorage {
  readSession(): Promise<StoredSession | null>;
  writeSession(value: StoredSession | null): Promise<void>;
  readDeletionReceipt(): Promise<string | null>;
  writeDeletionReceipt(value: string | null): Promise<void>;
}
