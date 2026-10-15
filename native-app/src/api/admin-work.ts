import { ApiError, requireValue } from './errors';
import type { AdminAccess } from './admin-access';
import type { Booking, JsonRecord } from '../domain/types';
import type { ManagedRun, WorkList, WorkSaveResult, WorkStep, WorkflowProduct } from '../domain/management';

function workflow(product?: WorkflowProduct): WorkStep[] {
  const raw: Partial<WorkStep>[] = product?.steps?.length ? product.steps : ['입고', '작업', '출고'].map(name => ({ name }));
  return raw.slice(0, 10).map(step => ({ ...step, name: String(step.name || '').trim(), photoRequired: step.photoRequired !== false,
    memoRequired: !!step.memoRequired, approvalRequired: !!step.approvalRequired, photoKeys: [], memo: '', submitted: false, approved: false })).filter(step => step.name);
}
class AdminWorkService {
  private busy = false;
  constructor(private access: AdminAccess, private id: () => string, private onChanged?: () => void) {}
  async list(): Promise<WorkList> {
    await this.access.load();
    return { runs: this.access.rows<ManagedRun>('pm-service-runs'), bookings: this.access.rows<Booking>('pm-bookings'),
      products: this.access.rows<WorkflowProduct>('pm-products'), branches: this.access.rows<{ name: string }>('pm-branches').map(row => row.name)
        .filter(branch => this.access.session.snapshot().role !== 'general' || this.access.session.snapshot().branches.includes(branch)) };
  }
  private async run(id: string) {
    const run = (await this.list()).runs.find(row => row.id === id); requireValue(run, 'WORK_UNAVAILABLE');
    this.access.requireBranch(run.branch); requireValue(Array.isArray(run.steps) && Number.isInteger(run.currentStep), 'INVALID_RESPONSE'); return run;
  }
  private async save(run: ManagedRun, action: string, step?: WorkStep): Promise<WorkSaveResult> {
    await this.access.merge('pm-service-runs', [run]);
    this.onChanged?.();
    const warnings: string[] = [], actor = this.access.session.snapshot().role === 'main' ? '메인관리자' : '일반관리자';
    const audit = { id: this.id(), at: new Date().toISOString(), by: actor, action, runId: run.id, car: run.car || '', customer: run.name || '',
      phone: run.phone || '', model: run.model || '', branch: run.branch, service: run.service || '', bookingDate: run.bookingDate || '',
      bookingTime: run.bookingTime || '', step: step?.name || '', memo: step?.memo || '', photos: step?.photoKeys.length || 0, detail: action };
    try { await this.access.merge('pm-work-audit', [audit]); } catch { warnings.push('AUDIT_SAVE_FAILED'); }
    return { run, warnings };
  }
  private async exclusive<T>(run: () => Promise<T>) {
    if (this.busy) throw new ApiError('REQUEST_IN_PROGRESS'); this.busy = true;
    try { return await run(); } finally { this.busy = false; }
  }
  createFromBooking(id: string) {
    return this.exclusive(async () => {
      const data = await this.list(), booking = data.bookings.find(row => row.id === id); requireValue(booking, 'BOOKING_UNAVAILABLE');
      this.access.requireBranch(booking.branch); requireValue(['신규', '승인대기', '예약'].includes(booking.status), 'BOOKING_UNAVAILABLE');
      const existing = data.runs.find(row => row.bookingKey === id); if (existing) return { run: existing, warnings: [] };
      const product = data.products.find(item => booking.services?.includes(item.name)) || data.products[0];
      const run: ManagedRun = { id: `run-native-${id}`, bookingKey: id, branch: booking.branch, bookingDate: booking.date, bookingTime: booking.time,
        memberId: booking.memberId || '', car: booking.car, name: booking.name, phone: booking.phone, model: booking.model,
        service: product?.name || '실시간 서비스', reason: booking.memo || '', steps: workflow(product), currentStep: 0, status: '입고 대기', createdAt: new Date().toISOString() };
      return this.save(run, '입고 시작');
    });
  }
  saveStep(id: string, index: number, input: { photoKeys: string[]; memo: string; mileage?: string; submit: boolean }) {
    return this.exclusive(async () => {
      const run = await this.run(id), step = run.steps[index]; requireValue(step && (!input.submit || index === run.currentStep), 'WORK_STEP_UNAVAILABLE');
      requireValue(input.photoKeys.length <= 30 && input.photoKeys.every(key => /^service-[A-Za-z0-9_.-]+$/.test(key)) && input.memo.length <= 4000);
      if (input.submit) {
        requireValue(!step.approved && !run.completedAt, 'WORK_STEP_UNAVAILABLE');
        requireValue(!step.photoRequired || input.photoKeys.length, 'PHOTO_REQUIRED'); requireValue(!step.memoRequired || input.memo.trim(), 'MEMO_REQUIRED');
        if (step.name.includes('입고')) requireValue(Number(input.mileage) > 0, 'MILEAGE_REQUIRED');
      }
      const removed = step.photoKeys.filter(key => !input.photoKeys.includes(key));
      step.deletedPhotos = [...(step.deletedPhotos || []), ...removed.map(key => ({ key, at: new Date().toISOString(), by: '관리자' }))];
      step.photoKeys = [...input.photoKeys]; step.memo = input.memo.trim(); step.photoUpdatedAt = new Date().toISOString();
      if (input.mileage !== undefined) run.mileage = input.mileage;
      if (input.submit) { step.submitted = true; step.submittedAt = new Date().toISOString();
        if (step.approvalRequired) run.status = `${step.name} 승인대기`; else this.advance(run, step);
      }
      return this.save(run, input.submit ? '단계 처리' : '제출 수정', step);
    });
  }
  private advance(run: ManagedRun, step: WorkStep) {
    step.approved = true; step.approvedAt = new Date().toISOString();
    if (run.currentStep < run.steps.length - 1) { run.currentStep++; run.status = `${run.steps[run.currentStep].name} 대기`; }
    else { run.status = '출고 완료'; run.completedAt = new Date().toISOString(); }
  }
  approveStep(id: string) {
    return this.exclusive(async () => { const run = await this.run(id), step = run.steps[run.currentStep]; this.access.requireMain();
      requireValue(step?.submitted && !step.approved, 'WORK_STEP_UNAVAILABLE'); this.advance(run, step); return this.save(run, '승인 · 고객 전송', step); });
  }
  rejectStep(id: string, reason: string) {
    return this.exclusive(async () => { const run = await this.run(id), step = run.steps[run.currentStep]; this.access.requireMain();
      requireValue(step?.submitted && !step.approved && reason.length <= 1000, 'WORK_STEP_UNAVAILABLE');
      step.submitted = false; step.rejectedAt = new Date().toISOString(); step.rejectReason = reason.trim(); run.status = `${step.name} 재작업`;
      return this.save(run, '반려', step); });
  }
  revertStep(id: string) {
    return this.exclusive(async () => { const run = await this.run(id); const current = run.steps[run.currentStep];
      const index = current?.submitted ? run.currentStep : run.currentStep - 1; requireValue(index >= 0, 'WORK_STEP_UNAVAILABLE');
      const step = run.steps[index]; step.deletedPhotos = [...(step.deletedPhotos || []), ...step.photoKeys.map(key => ({ key, at: new Date().toISOString(), by: '관리자' }))];
      step.photoKeys = []; step.submitted = false; step.approved = false; run.currentStep = index; run.completedAt = null; run.status = `${step.name} 대기`;
      return this.save(run, '단계 되돌리기', step); });
  }
  async audit(): Promise<JsonRecord[]> { await this.access.load(); return this.access.rows('pm-work-audit'); }
}
export function createAdminWorkService(access: AdminAccess, id: () => string, onChanged?: () => void) { return new AdminWorkService(access, id, onChanged); }
