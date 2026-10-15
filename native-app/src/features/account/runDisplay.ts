import {JsonRecord, ServiceRun} from '../../domain/types';
export type RunStep = {name: string; photoKeys: string[]; submitted: boolean; approved: boolean; note: string};
export function runSteps(run: ServiceRun): RunStep[] {
  const raw = Array.isArray(run.steps) ? run.steps : [];
  return raw.filter(value => value && typeof value === 'object').map(value => {
    const step = value as JsonRecord;
    return {name: String(step.name || '작업 단계'), photoKeys: Array.isArray(step.photoKeys) ? step.photoKeys.filter((key): key is string => typeof key === 'string') : [], submitted: !!step.submitted, approved: !!step.approved, note: String(step.note || step.memo || '')};
  });
}
export function runName(run: ServiceRun) {return String(run.serviceName || run.service || '정비');}
export function runStage(run?: ServiceRun) {
  if (!run) return -1;
  if (run.completedAt || /완료/.test(String(run.status || ''))) return 4;
  const step = runSteps(run)[Number(run.currentStep || 0)];
  return step?.submitted && !step.approved ? 3 : 2;
}
