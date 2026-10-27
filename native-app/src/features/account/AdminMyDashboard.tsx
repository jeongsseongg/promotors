import React, {useCallback} from 'react';
import {Image, Pressable, Text, View} from 'react-native';
import {useNav, useServices} from '../../components/AppContext';
import {DataState, useForegroundRefresh, useResource} from '../../components/DataState';
import type {Booking, Inquiry, SessionSnapshot} from '../../domain/types';
import type {WorkList} from '../../domain/management';
import {runStage} from './runDisplay';
import {MyGreeting, MyMenuSection} from './MyMenuSection';
import {myPage as card} from './myPageStyles';
import {adminMy as styles} from './adminMyStyles';

const koreanDay = (date: Date) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '.');
function completedDay(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  if (/^\d{4}\.\d{2}\.\d{2}/.test(value)) return value.slice(0, 10);
  const stamp = new Date(value);
  return Number.isFinite(stamp.getTime()) ? koreanDay(stamp) : '';
}
function pendingInquiries(messages: Inquiry[]) {
  const latest = new Map<string, Inquiry>();
  for (const row of [...messages].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))) {
    if ((row.serviceContext as {runId?: string} | undefined)?.runId) continue;
    const owner = row.memberId || row.customer?.id || row.id;
    if (!latest.has(owner)) latest.set(owner, row);
  }
  return [...latest.values()].filter(row => row.from !== 'admin').length;
}
export function adminDashboardSnapshot(work: WorkList, session: SessionSnapshot, messages: Inquiry[], now = new Date()) {
  if (!session.authenticated || !['main', 'general', 'developer'].includes(session.role || '')) throw new Error('관리자로 로그인해 주세요.');
  const visible = (branch?: string) => session.role !== 'general' || !!branch && session.branches.includes(branch);
  const bookings = work.bookings.filter(row => visible(row.branch));
  const runs = work.runs.filter(row => visible(row.branch));
  const active = bookings.filter(row => !['취소', '거절', '완료', '출고 완료'].includes(row.status) && row.historyOnly !== true);
  const today = koreanDay(now), todayBookings = active.filter(row => row.date === today);
  const newCount = todayBookings.filter(row => ['신규', '승인대기'].includes(row.status)).length;
  const confirmedCount = todayBookings.length - newCount;
  const activeRuns = runs.filter(row => runStage(row) < 4);
  const approvalCount = activeRuns.filter(row => row.steps?.[row.currentStep]?.submitted && !row.steps[row.currentStep].approved).length;
  const completedCount = runs.filter(row => runStage(row) === 4 && completedDay(row.completedAt || row.updatedAt) === today).length;
  const nextBooking = active.filter(row => row.date >= today).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  const owners = new Set([...bookings.map(row => row.memberId), ...runs.map(row => row.memberId)].filter(Boolean));
  const inquiries = messages.filter(row => session.role !== 'general' || (row.branch ? visible(String(row.branch)) : owners.has(row.memberId || row.customer?.id)));
  const branches = session.role === 'general' ? session.branches : work.branches;
  return {todayCount: todayBookings.length, newCount, confirmedCount, activeCount: activeRuns.length,
    approvalCount, completedCount, inquiryCount: pendingInquiries(inquiries), nextBooking,
    confirmationRate: todayBookings.length ? Math.round(confirmedCount / todayBookings.length * 100) : 0,
    branchLabel: branches.length === 1 ? branches[0] : session.role === 'general' ? branches.join(' · ') || '담당 지점 없음' : '전체 지점'};
}
type Summary = ReturnType<typeof adminDashboardSnapshot>;

function AdminCounts({summary}: {summary: Summary}) {
  const nav = useNav();
  const counts = [{label: '신규', value: summary.newCount, alert: summary.newCount > 0, booking: true},
    {label: '확정', value: summary.confirmedCount, booking: true}, {label: '작업중', value: summary.activeCount},
    {label: '승인대기', value: summary.approvalCount, alert: summary.approvalCount > 0}, {label: '출고', value: summary.completedCount}];
  return <View style={styles.counts}>{counts.map(item => <Pressable key={item.label} accessibilityRole="button"
    accessibilityLabel={`${item.label} ${item.value}건`} onPress={() => nav.go(item.booking ? {name: 'admin'} : {name: 'management', section: 'work'})}
    style={[styles.count, item.alert && styles.alertCount]}>
    <Text style={[styles.countValue, item.alert && styles.alertText]}>{item.value}</Text>
    <Text style={[styles.countLabel, item.alert && styles.alertText]}>{item.label}</Text>
  </Pressable>)}</View>;
}
function scheduleLabel(booking?: Booking) {
  if (!booking) return '예약 일정 없음';
  const stamp = new Date(`${booking.date.replace(/\./g, '-')}T${booking.time.slice(0, 5)}:00+09:00`);
  const label = Number.isFinite(stamp.getTime()) ? stamp.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }) : `${booking.date} ${booking.time}`;
  return [label, booking.car].filter(Boolean).join(' · ');
}
function AdminSummaryCard({summary}: {summary: Summary}) {
  const nav = useNav();
  return <View style={card.vehicle} testID="admin-my-dashboard"><View style={card.vehicleBody}>
    <View style={card.tags}><Text numberOfLines={1} style={card.plate}>{summary.branchLabel}</Text><Text style={card.badge}>관리중</Text></View>
    <View style={card.vehicleHead}><Text style={card.model}>오늘 예약 {summary.todayCount}건</Text>
      <Text style={card.description}>신규 {summary.newCount} · 확정 {summary.confirmedCount} · 출고 {summary.completedCount}</Text></View>
    <View style={card.rateRow}><Text style={card.rate}>{summary.confirmationRate}<Text style={card.percent}>%</Text></Text>
      <Text style={card.status}>확정 {summary.confirmedCount} / {summary.todayCount}건</Text></View>
    <View accessibilityRole="progressbar" accessibilityLabel="오늘 예약 확정률" accessibilityValue={{min: 0, max: 100, now: summary.confirmationRate}} style={card.track}>
      <View style={[card.progress, {width: `${summary.confirmationRate}%`}]}/></View>
    <AdminCounts summary={summary}/>
  </View><Pressable accessibilityRole="button" accessibilityLabel="다음 입고 예약 확인" style={card.next}
    onPress={() => nav.go(summary.nextBooking ? {name: 'admin-booking', id: summary.nextBooking.id} : {name: 'admin'})}>
    <Image source={require('../../../assets/account/calendar.png')} accessible={false} style={card.nextIcon}/>
    <Text style={card.nextTitle}>{summary.nextBooking ? '다음 입고' : '다음 예약'}</Text>
    <Text numberOfLines={1} style={card.nextDate}>{scheduleLabel(summary.nextBooking)}</Text><Text style={card.chevron}>›</Text>
  </Pressable></View>;
}
function AdminMenus({summary}: {summary: Summary}) {
  const services = useServices(), nav = useNav(), role = services.session.snapshot().role;
  return <>
    <MyMenuSection title="오늘 할 일" items={[
      {title: '예약관리', detail: summary.newCount ? `신규 ${summary.newCount}` : `${summary.todayCount}건`, icon: 'calendar', onPress: () => nav.go({name: 'admin'})},
      ...(role === 'main' ? [{title: '작업승인', detail: summary.approvalCount ? `대기 ${summary.approvalCount}` : '대기 없음', icon: 'check' as const, onPress: () => nav.go({name: 'management', section: 'work'})}] : []),
      {title: '고객문의', detail: summary.inquiryCount ? `답변 ${summary.inquiryCount}` : '답변 완료', icon: 'headset', onPress: () => nav.go({name: 'management', section: 'inquiries'})},
    ]}/>
    <MyMenuSection title="작업 · 고객" items={[
      {title: '작업현황', detail: `진행 ${summary.activeCount}건`, icon: 'wrench', onPress: () => nav.go({name: 'management', section: 'work'})},
      ...(role === 'main' || role === 'developer' ? [{title: '고객관리', icon: 'user' as const, onPress: () => nav.go({name: 'management', section: 'customers'})}] : []),
      {title: '매장 관리', detail: '작업·고객·콘텐츠·운영 설정', icon: 'doc', onPress: () => nav.go({name: 'management'})},
      {title: '예약 알림함', icon: 'bell', onPress: () => nav.go({name: 'notifications'})},
    ]}/>
  </>;
}
export function AdminMyDashboard() {
  const services = useServices();
  const resource = useResource(useCallback(async () => {
    const [work, messages] = await Promise.all([services.adminWork.list(), services.adminInquiries.list()]);
    return adminDashboardSnapshot(work, services.session.snapshot(), messages);
  }, [services]));
  useForegroundRefresh(resource.reload, 30000);
  const summary = resource.data;
  const subtitle = summary ? summary.newCount || summary.approvalCount
    ? `확인이 필요한 신규 예약 ${summary.newCount}건과 승인 대기 ${summary.approvalCount}건이 있어요.`
    : '새로 확인할 예약과 승인 대기가 없습니다.' : resource.error ? '매장 운영현황을 확인하지 못했습니다.' : '매장 운영현황을 불러오고 있어요.';
  return <><MyGreeting title="관리자님, 안녕하세요" subtitle={subtitle}/>
    <DataState loading={resource.loading && !summary} error={resource.error} onRetry={resource.reload}/>
    {summary ? <><AdminSummaryCard summary={summary}/><AdminMenus summary={summary}/></> : null}
  </>;
}
