import {MemberProfile, SessionSnapshot} from '../domain/types';
import {qaProfile} from './fixture-data';

export function createQaSession(admin: boolean, signedOut = false) {
  let state: SessionSnapshot = {status: signedOut ? 'signedOut' : 'signedIn', authenticated: !signedOut, role: admin ? 'general' : 'customer', branches: admin ? ['프로모터스 안산점'] : [], profile: admin ? {id: 'qa-manager', name: '예시 관리자'} : qaProfile, expiresAt: null, privacyEpoch: 1, deletionPending: false, revision: 0};
  const listeners = new Set<(next: SessionSnapshot) => void>();
  function update(patch: Partial<SessionSnapshot>) {state = {...state, ...patch, revision: state.revision + 1}; listeners.forEach(listener => listener(state));}
  const session = {
    snapshot: () => state,
    subscribe: (listener: (next: SessionSnapshot) => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    restore: async () => {},
    refresh: async () => {},
    loginMember: async (_id: string, _password: string, _remember?: boolean) => {update({status: 'signedIn', authenticated: true, role: 'customer', branches: [], profile: qaProfile});},
    loginAdmin: async (_password: string, _remember?: boolean) => {update({status: 'signedIn', authenticated: true, role: 'general', branches: ['프로모터스 안산점'], profile: {id: 'qa-manager', name: '예시 관리자'}});},
    loginBranchAdmin: async (_id: string, _password: string, _remember?: boolean) => {update({status: 'signedIn', authenticated: true, role: 'general', branches: ['프로모터스 안산점'], profile: {id: 'qa-manager', name: '예시 관리자'}});},
    register: async (profile: MemberProfile, _password: string) => {update({status: 'signedIn', authenticated: true, role: 'customer', branches: [], profile});},
    logout: async () => {update({status: 'signedOut', authenticated: false, role: null, branches: [], profile: null});},
  };
  return {session, update};
}
