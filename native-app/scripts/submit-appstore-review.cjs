const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const APP = '6810716100';
const BUNDLE = 'kr.promotors.app';
const release = require('../release.json');
const TARGET = {version: release.version, build: String(release.iosBuild)};
const NOTES = '프로모터스 시그니처 색상으로 정비·알림 화면을 통일했습니다.\n통합관리자가 업체별 계정과 담당 지점을 지정할 수 있습니다.\n업체 아이디 로그인과 자동 알림 연결 안내를 추가했습니다.';
const mode = process.env.PM_REVIEW_MODE || 'inspect';
const accepted = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE', 'PROCESSING_FOR_APP_STORE', 'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION']);
function check(value, code) { if (!value) throw Error(code); }
function token() {
  const {ASC_KEY_ID: kid, ASC_ISSUER_ID: issuer, ASC_PRIVATE_KEY: key} = process.env;
  check(kid && issuer && key, 'ASC_CREDENTIALS_REQUIRED');
  const now = Math.floor(Date.now() / 1000);
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = part({alg: 'ES256', kid, typ: 'JWT'}) + '.' + part({iss: issuer, iat: now, exp: now + 600, aud: 'appstoreconnect-v1'});
  return data + '.' + crypto.sign('sha256', Buffer.from(data), {key, dsaEncoding: 'ieee-p1363'}).toString('base64url');
}
async function request(endpoint, method = 'GET', body, optional = false) {
  check(endpoint.startsWith('/v1/'), 'INVALID_ASC_PATH');
  check(method === 'GET' || mode !== 'inspect', 'READ_ONLY_MODE');
  const response = await fetch('https://api.appstoreconnect.apple.com' + endpoint, {
    method, headers: {Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (optional && response.status === 404) return {data: null};
  if (!response.ok) {
    let errors; try { errors = (await response.json()).errors?.map(e => ({code: e.code, title: e.title, source: e.source})); } catch {}
    console.error(JSON.stringify({endpoint, status: response.status, requestId: response.headers.get('x-request-id'), errors}));
    throw Error('ASC_HTTP_' + response.status);
  }
  return response.status === 204 ? {} : response.json();
}
function data(type, id, attributes, relationships) {
  return {data: {type, ...(id ? {id} : {}), ...(attributes ? {attributes} : {}), ...(relationships ? {relationships} : {})}};
}
function link(type, id) { return {data: {type, id}}; }
function pick(source, fields) { return Object.fromEntries(fields.filter(k => source[k] != null).map(k => [k, source[k]])); }
async function context() {
  const app = (await request(`/v1/apps/${APP}`)).data;
  check(app.attributes.bundleId === BUNDLE, 'APP_IDENTITY_MISMATCH');
  const versions = (await request(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=50`)).data;
  const query = new URLSearchParams({'filter[app]': APP, 'filter[version]': TARGET.build, limit: '10'});
  const builds = (await request(`/v1/builds?${query}`)).data;
  check(builds.length === 1, 'EXACT_BUILD_REQUIRED');
  const build = builds[0];
  const release = (await request(`/v1/builds/${build.id}/preReleaseVersion`)).data;
  check(release.attributes.version === TARGET.version, 'BUILD_VERSION_MISMATCH');
  check(build.attributes.processingState === 'VALID', 'BUILD_NOT_VALID');
  check(build.attributes.usesNonExemptEncryption === false, 'EXPORT_COMPLIANCE_UNCONFIRMED');
  const submissions = (await request(`/v1/apps/${APP}/reviewSubmissions?limit=50&include=items`));
  for (const submission of submissions.data.filter(s => ['READY_FOR_REVIEW', 'WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(s.attributes.state))) {
    const rows = (await request(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`)).data;
    submissions.included = [...(submissions.included || []).filter(i => !rows.some(r => r.id === i.id)), ...rows];
  }
  return {app, versions, build, submissions, target: versions.find(v => v.attributes.versionString === TARGET.version)};
}
async function snapshot(ctx) {
  const target = ctx.target;
  const result = {checkedAt: new Date().toISOString(), app: APP, bundle: BUNDLE, target: TARGET, mode,
    versions: ctx.versions.map(v => ({id: v.id, version: v.attributes.versionString, state: v.attributes.appStoreState, releaseType: v.attributes.releaseType})),
    build: {id: ctx.build.id, version: ctx.build.attributes.version, processingState: ctx.build.attributes.processingState, usesNonExemptEncryption: ctx.build.attributes.usesNonExemptEncryption},
    submissions: ctx.submissions.data.map(s => ({id: s.id, state: s.attributes.state, submittedDate: s.attributes.submittedDate, items: s.relationships?.items?.data})),
    submissionItems: (ctx.submissions.included || []).filter(x => x.type === 'reviewSubmissionItems').map(x => ({id: x.id, state: x.attributes.state, version: x.relationships?.appStoreVersion?.data})),
  };
  if (target) {
    result.attachedBuild = (await request(`/v1/appStoreVersions/${target.id}/relationships/build`)).data;
    const locales = (await request(`/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)).data;
    result.localizations = [];
    for (const locale of locales) {
      const sets = (await request(`/v1/appStoreVersionLocalizations/${locale.id}/appScreenshotSets?include=appScreenshots&limit=50`));
      result.localizations.push({locale: locale.attributes.locale, whatsNew: locale.attributes.whatsNew,
        screenshotSets: sets.data.map(s => ({id: s.id, display: s.attributes.screenshotDisplayType, count: s.relationships?.appScreenshots?.data?.length || 0}))});
    }
    const detail = (await request(`/v1/appStoreVersions/${target.id}/appStoreReviewDetail`, 'GET', undefined, true)).data;
    result.reviewDetails = detail ? {id: detail.id, demoAccountRequired: detail.attributes.demoAccountRequired,
      hasDemoUsername: Boolean(detail.attributes.demoAccountName), hasDemoPassword: Boolean(detail.attributes.demoAccountPassword),
      hasContact: Boolean(detail.attributes.contactEmail && detail.attributes.contactPhone)} : null;
  }
  return result;
}
async function prepareLocalization(target, previous) {
  const existing = (await request(`/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations?limit=50`)).data;
  const previousLocales = (await request(`/v1/appStoreVersions/${previous.id}/appStoreVersionLocalizations?limit=50`)).data;
  check(previousLocales.some(x => x.attributes.locale === 'ko'), 'PREVIOUS_KOREAN_METADATA_REQUIRED');
  for (const source of previousLocales) {
    const current = existing.find(x => x.attributes.locale === source.attributes.locale);
    const attributes = {...pick(source.attributes, ['description', 'keywords', 'marketingUrl', 'supportUrl', 'promotionalText']), whatsNew: NOTES};
    if (current) await request(`/v1/appStoreVersionLocalizations/${current.id}`, 'PATCH', data('appStoreVersionLocalizations', current.id, attributes));
    else await request('/v1/appStoreVersionLocalizations', 'POST', data('appStoreVersionLocalizations', null,
      {...attributes, locale: source.attributes.locale}, {appStoreVersion: link('appStoreVersions', target.id)}));
  }
}
async function prepareReviewDetail(target, previous) {
  const detail = (await request(`/v1/appStoreVersions/${target.id}/appStoreReviewDetail`, 'GET', undefined, true)).data;
  if (detail) return;
  const source = (await request(`/v1/appStoreVersions/${previous.id}/appStoreReviewDetail`)).data;
  check(source, 'PREVIOUS_REVIEW_DETAIL_REQUIRED');
  const attributes = pick(source.attributes, ['contactFirstName', 'contactLastName', 'contactPhone', 'contactEmail', 'demoAccountName', 'demoAccountPassword', 'demoAccountRequired', 'notes']);
  await request('/v1/appStoreReviewDetails', 'POST', data('appStoreReviewDetails', null, attributes, {appStoreVersion: link('appStoreVersions', target.id)}));
}
async function prepare(ctx) {
  if (ctx.target && accepted.has(ctx.target.attributes.appStoreState)) {
    const attached = (await request(`/v1/appStoreVersions/${ctx.target.id}/relationships/build`)).data;
    check(attached?.id === ctx.build.id, 'ATTACHED_BUILD_MISMATCH');
    return;
  }
  const previous = ctx.versions.filter(v => v.attributes.versionString !== TARGET.version &&
    ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(v.attributes.appStoreState))
    .sort((a, b) => b.attributes.versionString.localeCompare(a.attributes.versionString, undefined, {numeric: true}))[0];
  check(previous, 'PREVIOUS_RELEASE_REQUIRED');
  check(!ctx.versions.some(v => v.attributes.versionString !== TARGET.version && ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(v.attributes.appStoreState)), 'OTHER_VERSION_IN_REVIEW');
  let target = ctx.target;
  if (!target) target = (await request('/v1/appStoreVersions', 'POST', data('appStoreVersions', null,
    {platform: 'IOS', versionString: TARGET.version, copyright: previous.attributes.copyright, releaseType: 'AFTER_APPROVAL'}, {app: link('apps', APP)}))).data;
  check(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(target.attributes.appStoreState), 'VERSION_NOT_EDITABLE');
  if (target.attributes.releaseType !== 'AFTER_APPROVAL') await request(`/v1/appStoreVersions/${target.id}`, 'PATCH',
    data('appStoreVersions', target.id, {releaseType: 'AFTER_APPROVAL'}));
  await request(`/v1/appStoreVersions/${target.id}/relationships/build`, 'PATCH', {data: {type: 'builds', id: ctx.build.id}});
  await prepareLocalization(target, previous);
  await prepareReviewDetail(target, previous);
}
async function submit(ctx) {
  const target = ctx.target;
  check(target, 'PREPARE_VERSION_FIRST');
  const status = await snapshot(ctx);
  check(status.attachedBuild?.id === ctx.build.id, 'ATTACHED_BUILD_MISMATCH');
  if (accepted.has(target.attributes.appStoreState)) return;
  check(status.localizations.some(l => l.locale === 'ko' && l.whatsNew === NOTES && l.screenshotSets.some(s => s.count > 0)), 'KOREAN_SCREENSHOTS_AND_NOTES_REQUIRED');
  check(status.reviewDetails?.hasContact, 'REVIEW_CONTACT_REQUIRED');
  check(!status.reviewDetails.demoAccountRequired || (status.reviewDetails.hasDemoUsername && status.reviewDetails.hasDemoPassword), 'REVIEW_LOGIN_REQUIRED');
  const items = ctx.submissions.included?.filter(i => i.type === 'reviewSubmissionItems' && i.relationships?.appStoreVersion?.data?.id === target.id) || [];
  let submission = ctx.submissions.data.find(s => ['READY_FOR_REVIEW', 'WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(s.attributes.state) && s.relationships?.items?.data?.some(i => items.some(j => j.id === i.id)));
  if (submission && ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(submission.attributes.state)) return;
  if (!submission) {
    check(!ctx.submissions.data.some(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES'].includes(s.attributes.state)), 'OTHER_SUBMISSION_ACTIVE');
    submission = (await request('/v1/reviewSubmissions', 'POST', data('reviewSubmissions', null, {platform: 'IOS'}, {app: link('apps', APP)}))).data;
    await request('/v1/reviewSubmissionItems', 'POST', data('reviewSubmissionItems', null, null,
      {reviewSubmission: link('reviewSubmissions', submission.id), appStoreVersion: link('appStoreVersions', target.id)}));
  }
  const actualItems = (await request(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`)).data;
  check(actualItems.length === 1 && actualItems[0].relationships?.appStoreVersion?.data?.id === target.id, 'SUBMISSION_SCOPE_MISMATCH');
  await request(`/v1/reviewSubmissions/${submission.id}`, 'PATCH', data('reviewSubmissions', submission.id, {submitted: true}));
  const verified = (await request(`/v1/reviewSubmissions/${submission.id}`)).data;
  check(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'COMPLETE'].includes(verified.attributes.state), 'SUBMISSION_NOT_ACCEPTED');
}
async function cancelReview(ctx) {
  const target = ctx.target;
  const pending = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW']);
  check(target && pending.has(target.attributes.appStoreState), 'PENDING_REVIEW_REQUIRED');
  const previousBuild = process.env.PM_CONFIRM_REPLACED_BUILD;
  check(/^[0-9]+$/.test(previousBuild || '') && Number.isSafeInteger(Number(previousBuild)) &&
    Number(previousBuild) < Number(TARGET.build), 'EXACT_PREVIOUS_BUILD_REQUIRED');
  const attached = (await request(`/v1/appStoreVersions/${target.id}/relationships/build`)).data;
  check(attached?.id && attached.id !== ctx.build.id, 'PREVIOUS_ATTACHMENT_REQUIRED');
  const old = (await request(`/v1/builds/${attached.id}`)).data;
  check(old?.attributes.version === previousBuild, 'PREVIOUS_BUILD_MISMATCH');
  const oldApp = (await request(`/v1/builds/${old.id}/app`)).data;
  check(oldApp?.id === APP && oldApp.attributes.bundleId === BUNDLE, 'PREVIOUS_APP_MISMATCH');
  const oldVersion = (await request(`/v1/builds/${old.id}/preReleaseVersion`)).data;
  check(oldVersion?.attributes.version === TARGET.version, 'PREVIOUS_VERSION_MISMATCH');
  const items = ctx.submissions.included?.filter(i => i.type === 'reviewSubmissionItems' &&
    i.relationships?.appStoreVersion?.data?.id === target.id) || [];
  const candidates = ctx.submissions.data.filter(s => pending.has(s.attributes.state) &&
    s.relationships?.items?.data?.some(i => items.some(j => j.id === i.id)));
  check(candidates.length === 1, 'EXACT_PENDING_SUBMISSION_REQUIRED');
  const submission = candidates[0];
  const scope = (await request(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`)).data;
  check(scope.length === 1 && scope[0].relationships?.appStoreVersion?.data?.id === target.id,
    'SUBMISSION_SCOPE_MISMATCH');
  const current = (await request(`/v1/reviewSubmissions/${submission.id}`)).data;
  check(pending.has(current?.attributes.state), 'SUBMISSION_NO_LONGER_PENDING');
  const canceled = (await request(`/v1/reviewSubmissions/${submission.id}`, 'PATCH',
    data('reviewSubmissions', submission.id, {canceled: true}))).data;
  check(canceled?.id === submission.id, 'CANCELLATION_RESPONSE_MISMATCH');
  return {requestedAt: new Date().toISOString(), versionId: target.id, submissionId: submission.id,
    previousBuild, beforeState: current.attributes.state, afterState: canceled.attributes.state};
}
async function verifyAutomaticScope(target, build, submission, releaseType) {
  const version = (await request(`/v1/appStoreVersions/${target.id}`)).data;
  check(version?.id === target.id && version.attributes.versionString === TARGET.version &&
    version.attributes.appStoreState === target.attributes.appStoreState &&
    version.attributes.releaseType === releaseType, 'AUTOMATIC_VERSION_CHANGED');
  const current = (await request(`/v1/reviewSubmissions/${submission.id}`)).data;
  check(current?.id === submission.id && current.attributes.state === submission.attributes.state &&
    current.attributes.submittedDate === submission.attributes.submittedDate, 'AUTOMATIC_SUBMISSION_CHANGED');
  const scope = (await request(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`)).data;
  check(scope.length === 1 && scope[0].relationships?.appStoreVersion?.data?.id === target.id &&
    (current.attributes.state !== 'COMPLETE' || scope[0].attributes.state === 'APPROVED'), 'SUBMISSION_SCOPE_MISMATCH');
  const attached = (await request(`/v1/appStoreVersions/${target.id}/relationships/build`)).data;
  check(attached?.id === build.id, 'ATTACHED_BUILD_MISMATCH');
}
async function automatic(ctx) {
  const target = ctx.target;
  check(target?.id && target.attributes.versionString === TARGET.version, 'RELEASE_VERSION_ID_MISMATCH');
  check(ctx.build.attributes.version === TARGET.build, 'RELEASE_BUILD_NUMBER_MISMATCH');
  check(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_DEVELOPER_RELEASE'].includes(target.attributes.appStoreState),
    'AUTOMATIC_PENDING_VERSION_REQUIRED');
  check(['MANUAL', 'AFTER_APPROVAL'].includes(target.attributes.releaseType), 'AUTOMATIC_RELEASE_TYPE_UNEXPECTED');
  const state = target.attributes.appStoreState === 'PENDING_DEVELOPER_RELEASE' ? 'COMPLETE' : target.attributes.appStoreState;
  const items = ctx.submissions.included?.filter(i => i.type === 'reviewSubmissionItems' &&
    i.relationships?.appStoreVersion?.data?.id === target.id) || [];
  const candidates = ctx.submissions.data.filter(s => s.attributes.state === state &&
    s.relationships?.items?.data?.some(i => items.some(j => j.id === i.id)));
  check(candidates.length === 1 && candidates[0].attributes.submittedDate, 'EXACT_SUBMITTED_VERSION_REQUIRED');
  const submission = candidates[0];
  await verifyAutomaticScope(target, ctx.build, submission, target.attributes.releaseType);
  const changed = target.attributes.releaseType !== 'AFTER_APPROVAL';
  if (changed) await request(`/v1/appStoreVersions/${target.id}`, 'PATCH',
    data('appStoreVersions', target.id, {releaseType: 'AFTER_APPROVAL'}));
  await verifyAutomaticScope(target, ctx.build, submission, 'AFTER_APPROVAL');
  return {versionId: target.id, buildId: ctx.build.id, submissionId: submission.id,
    releaseType: 'AFTER_APPROVAL', changed};
}
async function releaseApprovedVersion(ctx) {
  const target = ctx.target;
  check(target?.id && target.attributes.versionString === TARGET.version, 'RELEASE_VERSION_ID_MISMATCH');
  check(ctx.build.attributes.version === TARGET.build, 'RELEASE_BUILD_NUMBER_MISMATCH');
  const attached = (await request(`/v1/appStoreVersions/${target.id}/relationships/build`)).data;
  check(attached?.id === ctx.build.id, 'ATTACHED_BUILD_MISMATCH');
  const state = target.attributes.appStoreState;
  if (['PENDING_APPLE_RELEASE', 'PROCESSING_FOR_APP_STORE', 'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(state))
    return {alreadyRequested: true, versionId: target.id, state};
  check(state === 'PENDING_DEVELOPER_RELEASE' && target.attributes.releaseType === 'MANUAL', 'APPROVED_MANUAL_RELEASE_REQUIRED');
  let approved = false;
  for (const submission of ctx.submissions.data.filter(s => s.attributes.state === 'COMPLETE')) {
    const items = (await request(`/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=50`)).data;
    if (items.length === 1 && items[0].attributes.state === 'APPROVED' &&
      items[0].relationships?.appStoreVersion?.data?.id === target.id) {approved = true; break;}
  }
  check(approved, 'APPROVED_SUBMISSION_SCOPE_REQUIRED');
  const released = await request('/v1/appStoreVersionReleaseRequests', 'POST',
    data('appStoreVersionReleaseRequests', null, null, {appStoreVersion: link('appStoreVersions', target.id)}));
  return {requestedAt: new Date().toISOString(), versionId: target.id, requestId: released.data.id};
}
async function main() {
  check(['inspect', 'prepare', 'submit', 'release', 'cancel', 'automatic'].includes(mode), 'INVALID_MODE');
  if (mode !== 'inspect') check(process.env.PM_CONFIRM_REVIEW_VERSION === `${TARGET.version}/${TARGET.build}`, 'EXPLICIT_VERSION_CONFIRMATION_REQUIRED');
  let ctx = await context();
  if (mode === 'prepare') { await prepare(ctx); ctx = await context(); }
  if (mode === 'submit') { await submit(ctx); ctx = await context(); }
  let releaseAction, cancelAction, automaticAction;
  if (mode === 'cancel') { cancelAction = await cancelReview(ctx); ctx = await context(); }
  if (mode === 'automatic') { automaticAction = await automatic(ctx); ctx = await context(); }
  if (mode === 'release') { releaseAction = await releaseApprovedVersion(ctx); ctx = await context(); }
  const result = await snapshot(ctx);
  if (releaseAction) result.releaseAction = releaseAction;
  if (cancelAction) result.cancelAction = cancelAction;
  if (automaticAction) result.automaticAction = automaticAction;
  const output = JSON.stringify(result, null, 2);
  console.log(output);
  if (process.env.RUNNER_TEMP) fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'appstore-review-status.json'), output);
}
main().catch(error => {
  const known = /^[A-Z0-9_]+$/.test(error.message);
  console.error(known ? error.message : 'APPSTORE_REVIEW_FAILED');
  if (!known) console.error(JSON.stringify({type: error.name,
    transportCode: error.cause?.code, location: error.stack?.match(/submit-appstore-review\.cjs:[0-9]+:[0-9]+/)?.[0]}));
  process.exitCode = 1;
});
