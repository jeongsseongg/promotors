import type { JsonRecord, ServiceRun, Branch, PublicPost, IntroSlide, Booking } from './types';
export interface WorkStep extends JsonRecord {
  name: string; photoRequired: boolean; memoRequired: boolean; approvalRequired: boolean;
  photoKeys: string[]; memo: string; submitted: boolean; approved: boolean;
  submittedAt?: string; approvedAt?: string; deletedPhotos?: {key: string; at: string; by: string}[];
}
export interface ManagedRun extends ServiceRun {
  steps: WorkStep[]; currentStep: number; branch: string; bookingKey: string;
  car?: string; name?: string; phone?: string; model?: string; completedAt?: string | null;
}
export interface WorkflowProduct extends JsonRecord { name: string; desc?: string; steps: Partial<WorkStep>[] }
export interface WorkSaveResult { run: ManagedRun; warnings: string[] }
export interface CustomerFile extends JsonRecord { memo?: string; memoEntries?: JsonRecord[]; records?: JsonRecord[] }
export interface ContentReference { index: number; fingerprint: string }
export interface ContentRow<T extends JsonRecord = JsonRecord> { value: T; reference: ContentReference }
export interface ManagementContent {
  branches: ContentRow<Branch>[]; cases: ContentRow<PublicPost>[]; notices: ContentRow<PublicPost>[];
  products: ContentRow<WorkflowProduct>[]; introSlides: ContentRow<IntroSlide>[];
}
export type ImagePrefix = 'service' | 'case' | 'notice' | 'branch' | 'intro' | 'event';
export interface PickedPhoto { base64: string; type: 'image/jpeg' | 'image/png' | 'image/webp'; fileName?: string }
export type PhotoPicker = (options: {source: 'camera' | 'library'; limit: number}) => Promise<PickedPhoto[]>;
export interface PhotoUploadRequest { source: 'camera' | 'library'; prefix: ImagePrefix; branch?: string; runId?: string; limit: number }
export interface WorkList { runs: ManagedRun[]; bookings: Booking[]; products: WorkflowProduct[]; branches: string[] }
