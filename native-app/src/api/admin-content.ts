import { NATIVE_SOURCE } from './client';
import { requireValue } from './errors';
import type { AdminAccess } from './admin-access';
import type { Branch, BranchSchedule, IntroSlide, JsonRecord, PublicPost } from '../domain/types';
import type { ContentReference, ManagementContent, WorkflowProduct } from '../domain/management';

const tagged = <T extends JsonRecord>(rows: T[]) => rows.map((value, index) => ({ value, reference: { index, fingerprint: JSON.stringify(value) } }));
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function createAdminContentService(access: AdminAccess) {
  async function list(): Promise<ManagementContent> {
    await access.load(true);
    return { branches: tagged(access.rows<Branch>('pm-branches')), cases: tagged(access.rows<PublicPost>('promotors-cases')),
      notices: tagged(access.rows<PublicPost>('pm-notices')), products: tagged(access.rows<WorkflowProduct>('pm-products')),
      introSlides: tagged(access.rows<IntroSlide>('pm-intro-slides')) };
  }
  async function savePost(kind: 'case' | 'notice', reference: ContentReference | null, value: {title: string; date: string; body: string;
    imageKeys: string[]; brand?: string; postUrl?: string; scheduledAt?: string; originalHtml?: string; originalText?: string}) {
    requireValue(value.title.trim() && value.title.length <= 300 && /^\d{4}\.\d{2}\.\d{2}$/.test(value.date) && value.body.length <= 20000);
    requireValue(value.imageKeys.length <= 10 && value.imageKeys.every(key => new RegExp(`^${kind}-[A-Za-z0-9_.-]+$`).test(key)));
    requireValue(!value.postUrl || /^https?:\/\//.test(value.postUrl));
    requireValue(!value.scheduledAt || Number.isFinite(Date.parse(value.scheduledAt)));
    const entry: PublicPost = { title: value.title.trim(), date: value.date, brand: value.brand || '', postUrl: value.postUrl || '', scheduledAt: value.scheduledAt || '',
      bodyHtml: value.originalHtml && value.body === value.originalText ? value.originalHtml : value.body.split(/\n/).map(line => `<p>${escape(line)}</p>`).join(''), imageKeys: [...value.imageKeys] };
    return access.replace(kind === 'case' ? 'promotors-cases' : 'pm-notices', reference, entry);
  }
  async function saveProduct(reference: ContentReference | null, value: WorkflowProduct) {
    requireValue(value.name.trim() && value.name.length <= 200 && value.steps.length > 0 && value.steps.length <= 10);
    const steps = value.steps.map(step => ({ name: String(step.name || '').trim(), photoRequired: step.photoRequired !== false,
      memoRequired: !!step.memoRequired, approvalRequired: !!step.approvalRequired })); requireValue(steps.every(step => step.name && step.name.length <= 100));
    return access.replace('pm-products', reference, { name: value.name.trim(), desc: String(value.desc || '').slice(0, 4000), steps });
  }
  async function saveBranch(reference: ContentReference | null, value: Branch) {
    requireValue(value.name.trim() && value.name.length <= 100 && (!value.map || /^https?:\/\//.test(value.map)));
    if (reference) { await access.load(true); requireValue(access.rows<Branch>('pm-branches')[reference.index]?.name === value.name, 'BRANCH_RENAME_NOT_ALLOWED'); }
    return access.replace('pm-branches', reference, value);
  }
  async function hours() { await access.session.ensureReady(); access.session.requireRole('admin'); return access.rpc.call<Record<string, BranchSchedule>>('pm_branch_hours_read'); }
  async function saveHours(branch: string, settings: BranchSchedule) {
    await access.load(); access.requireBranch(branch);
    requireValue(settings.days && Object.keys(settings.days).every(key => /^[0-6]$/.test(key)));
    for (const day of Object.values(settings.days)) requireValue(typeof day.open === 'boolean' && /^\d{2}:\d{2}$/.test(day.start) && /^\d{2}:\d{2}$/.test(day.end) && (!day.open || day.start < day.end));
    requireValue(!settings.lunchEnabled || /^\d{2}:\d{2}$/.test(settings.lunchStart || '') && /^\d{2}:\d{2}$/.test(settings.lunchEnd || '') && settings.lunchStart! < settings.lunchEnd!);
    requireValue(!settings.closedDates || settings.closedDates.every(date => /^\d{4}\.\d{2}\.\d{2}$/.test(date)));
    return access.rpc.call<Record<string, BranchSchedule>>('pm_branch_hours_write', { p_branch: branch, p_settings: settings, p_page_url: NATIVE_SOURCE });
  }
  return { list, savePost, saveProduct, saveBranch, hours, saveHours,
    saveIntro: (reference: ContentReference | null, value: IntroSlide) => { requireValue(/^intro-[A-Za-z0-9_.-]+$/.test(value.key)); return access.replace('pm-intro-slides', reference, value); } };
}
