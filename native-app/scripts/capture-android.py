import json
import os
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'qa-results' / 'android'
output.mkdir(parents=True, exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb', *args])

def failed(kind, error, traceback):
    try:
        (output / 'failure.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        (output / 'failure-logcat.txt').write_bytes(adb('logcat', '-d', '-s', 'ReactNativeJS', 'AndroidRuntime'))
        (output / 'failure-ui.xml').write_text(hierarchy(), encoding='utf8')
    finally:
        sys.__excepthook__(kind, error, traceback)

sys.excepthook = failed

dump_number = 0
live_capture = False
launcher_recoveries = 0
def hierarchy():
    global dump_number
    if live_capture:
        result = adb('shell', 'am', 'instrument', '-w', 'kr.promotors.app.test/kr.promotors.app.qa.CaptureInstrumentation').decode('utf8')
        assert 'PM_XML_BEGIN' in result and 'PM_XML_END' in result, result
        return result.split('PM_XML_BEGIN', 1)[1].split('PM_XML_END', 1)[0].strip()
    dump_number += 1
    remote = '/sdcard/pm-ui-' + str(dump_number) + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', remote)
        source = adb('shell', 'cat', remote).decode('utf8')
        return source if '<hierarchy' in source else ''
    except subprocess.CalledProcessError:
        return ''

def wait_for(label):
    global launcher_recoveries
    for _ in range(35):
        source = hierarchy()
        if "Pixel Launcher isn&apos;t responding" in source or "Pixel Launcher isn't responding" in source:
            if launcher_recoveries >= 1: raise RuntimeError('Emulator launcher repeatedly failed')
            launcher_recoveries += 1
            save('emulator-launcher-anr', source)
            tap('android:id/aerr_close', source)
            continue
        if label in source and 'com.facebook.react.devsupport' not in source:
            return source
        time.sleep(2)
    raise RuntimeError('Native screen not ready: ' + label)

def save(name, source=None):
    source = source or hierarchy()
    (output / (name + '.xml')).write_text(source, encoding='utf8')
    (output / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    assert 'android.webkit.WebView' not in source, 'WebView found in independent app'
    assert 'android.widget.TextView' in source, 'Native text views not rendered'

def tap(text, source=None):
    document = ET.fromstring(source or hierarchy())
    for node in document.iter('node'):
        if text in [node.get('text'), node.get('content-desc'), node.get('resource-id')]:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
            return
    raise RuntimeError('Native control unavailable: ' + text)

def expand_card(source, title, expanded=True, exact=False):
    document = ET.fromstring(source)
    parents = {child: parent for parent in document.iter() for child in parent}
    anchor = next((node for node in document.iter('node') if (title == node.get('text', '') if exact else title in node.get('text', ''))), None)
    while anchor is not None:
        candidates = [node for node in anchor.iter('node') if node.get('resource-id', '').endswith('/expand_button')]
        if candidates:
            control = candidates[0]
            label = control.get('content-desc', '').lower()
            is_expanded = '접' in label or 'collapse' in label
            is_collapsed = '펼' in label or 'expand' in label
            if (expanded and is_collapsed) or (not expanded and is_expanded):
                x1, y1, x2, y2 = map(int, re.findall(r'\d+', control.get('bounds')))
                adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(1)
                return hierarchy()
            return source
        anchor = parents.get(anchor)
    return source


def save_ongoing_notification():
    global live_capture
    live_capture = True
    records = adb('shell', 'dumpsys', 'notification', '--noredact').decode('utf8')
    own = [record for record in re.split(r'(?=NotificationRecord\()', records)
           if 'pkg=kr.promotors.app' in record and 'tag=promotors_booking_schedule' in record]
    assert own, 'Actual ongoing reservation notification not posted'
    assert all(value in own[0] for value in ['BMW 520d', '예시 고객', '비공개'])
    (output / 'booking-ongoing-notification.txt').write_text(own[0], encoding='utf8')
    source = wait_for('BMW 520d')
    source = expand_card(source, 'BMW 520d', False)
    save('booking-ongoing-compact', source)
    source = expand_card(source, 'BMW 520d', True)
    for value in ['승인 대기 1건', '방문 예정 1건', '예시 고객', 'BMW 520d', '비공개', '승인·거절하기']:
        assert value in source, 'Ongoing notification content absent: ' + value
    save('booking-ongoing-notification', source)
    def remaining(xml):
        timers = [node for node in ET.fromstring(xml).iter('node') if node.get('class') == 'android.widget.Chronometer']
        assert timers, 'Actual system-managed body timer absent'
        value = timers[0].get('text')
        fields = [int(part) for part in value.split(':')]
        return sum(part * 60 ** index for index, part in enumerate(reversed(fields)))
    before = remaining(source)
    time.sleep(3)
    after_source = hierarchy()
    after = remaining(after_source)
    assert 0 < after < before <= 2700, f'Countdown did not advance in OS drawer: {before} -> {after}'
    (output / 'ongoing-live-countdown.json').write_text(json.dumps({'beforeSeconds': before, 'afterSeconds': after, 'systemManagedTimerAdvanced': True}), encoding='utf8')
    save('booking-ongoing-after', after_source)
    tap('예시 고객', after_source)
    live_capture = False
    source = wait_for('예약 상세')
    assert 'BMW 520d' in source and '예약 승인' in source and '예약 거절' in source
    save('ongoing-open-detail', source)


def set_appearance(mode):
    adb('shell', 'cmd', 'uimode', 'night', mode)
    observed = adb('shell', 'cmd', 'uimode', 'night').decode('utf8').strip().lower()
    assert observed.endswith(mode), 'System night mode not applied: ' + observed


set_appearance('no')
adb('install', '-r', str(root / 'android/app/build/outputs/apk/debug/app-debug.apk'))
adb('install', '-r', str(root / 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
adb('shell', 'pm', 'revoke', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
adb('shell', 'pm', 'clear-permission-flags', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS', 'user-set', 'user-fixed')
adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', 'setup', '--ez', 'requestOsPermission', 'true')
# A signed-in native session must request OS permission without any connect-button tap.
source = wait_for('com.android.permissioncontroller')
assert '프로모터스' in source, 'Native permission does not identify the app'
assert '알림을 보내' in source or 'notifications' in source.lower(), 'Notification permission text absent'
save('os-notification-permission', source)
allow = next(node for node in ET.fromstring(source).iter('node') if node.get('resource-id', '').endswith('/permission_allow_button'))
tap(allow.get('resource-id'), source)
source = wait_for('앱 알림이 연결됐어요')
assert '알림 설정' in source and '실제 발송 없음' in source
save('automatic-notification-connected', source)
tap('알림 설정', source)
source = wait_for('앱 알림 설정')
assert '연결됨' in source and '테스트 알림 보내기' in source
save('automatic-notification-settings', source)
results = [{'screen': 'setup', 'systemAppearance': 'light', 'nativeViews': True, 'webViewCount': 0, 'automaticOsPermission': True, 'allowImmediatelyConnected': True, 'settingsOpened': True}]
for screen, label in [('booking', '정비 예약'), ('mypage', '마이페이지'), ('admin', '예약관리'), ('notifications', '앱 알림 설정'), ('updates', '새 버전이 나왔어요'), ('setup-denied', '앱 알림을 켜주세요'), ('inbox', '프로모터스 알림'), ('detail', '예약 상세'), ('customer', '마이페이지')]:
    adb('shell', 'am', 'force-stop', 'kr.promotors.app')
    adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', screen)
    source = wait_for('실제 발송 없음')
    source = wait_for(label)
    save(screen, source)
    results.append({'screen': screen, 'systemAppearance': 'light', 'nativeViews': True, 'webViewCount': 0})
    if screen == 'customer':
        for phase, button, title in [('confirmed', '확정 예시', '예약이 확정되었어요'), ('visit', '방문 예시', '방문을 기다리고 있어요'), ('repair', '정비 예시', '내 차 정비 중'), ('completed', '완료 예시', '정비가 완료되었어요')]:
            tap(button, wait_for(button))
            wait_for('고객 상시알림 예시 표시')
            adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
            adb('shell', 'cmd', 'statusbar', 'expand-notifications')
            live_capture = True
            source = wait_for(title)
            source = expand_card(source, 'BMW 520d', False)
            save('customer-' + phase + '-compact', source)
            if phase == 'visit':
                assert any(node.get('class') == 'android.widget.Chronometer' and node.get('resource-id', '').endswith('/customer_countdown') for node in ET.fromstring(source).iter('node'))
            source = expand_card(source, 'BMW 520d', True)
            assert '예약 승인' not in source and '예약 거절' not in source
            assert '정비 진행' in source and 'BMW 520d' in source
            save('customer-' + phase + '-ongoing', source)
            if phase == 'visit':
                def customer_remaining(xml):
                    timer = next(node for node in ET.fromstring(xml).iter('node') if node.get('class') == 'android.widget.Chronometer' and node.get('resource-id', '').endswith('/customer_countdown'))
                    return sum(int(part) * 60 ** index for index, part in enumerate(reversed(timer.get('text').split(':'))))
                before = customer_remaining(source)
                time.sleep(3)
                after = customer_remaining(hierarchy())
                assert 0 < after < before <= 2700
                (output / 'customer-live-countdown.json').write_text(json.dumps({'beforeSeconds': before, 'afterSeconds': after, 'systemManagedTimerAdvanced': True}), encoding='utf8')
            adb('shell', 'cmd', 'statusbar', 'collapse')
            adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity')
            live_capture = False
        tap('정비 예시', wait_for('정비 예시'))
        wait_for('고객 상시알림 예시 표시')
        adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
        adb('shell', 'am', 'kill', 'kr.promotors.app')
        adb('shell', 'cmd', 'statusbar', 'expand-notifications')
        live_capture = True
        source = wait_for('예시 · 내 차 정비 중')
        tap('예시 · 내 차 정비 중', source)
        live_capture = False
        source = wait_for('정비 상세')
        assert '예약 정보 보기' in source and '차량 상태를 점검했습니다.' in source
        save('customer-notification-open-detail', source)
        tap('예약 정보 보기', source)
        wait_for('예약 상세')
        tap('정비 예시', wait_for('정비 예시'))
        wait_for('고객 상시알림 예시 표시')
        adb('shell', 'cmd', 'statusbar', 'expand-notifications')
        live_capture = True
        source = expand_card(wait_for('BMW 520d'), 'BMW 520d', True)
        tap('kr.promotors.app:id/customer_link', source)
        live_capture = False
        source = wait_for('정비 상세')
        assert '예약 정보 보기' in source and '차량 상태를 점검했습니다.' in source
        save('customer-ongoing-open-detail', source)
        tap('예약 정보 보기', source)
        source = wait_for('예약 상세')
        assert 'BMW 520d' in source and '예약 전체 정보' in source
        save('customer-linked-booking', source)
    if screen == 'updates':
        assert '업데이트' in source and '나중에' in source, 'Update choices absent'
        tap('나중에', source)
        dismissed = wait_for('마이페이지')
        assert '새 버전이 나왔어요' not in dismissed, 'Dismissed update still blocks the app'
    if screen == 'booking':
        tap('프로모터스 안산점', source)
        save('booking-calendar', wait_for('다음 달'))
    if screen == 'admin':
        adb('shell', 'pm', 'grant', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
        tap('상시알림 예시', source)
        wait_for('예시 상시알림 표시 요청')
        adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
        adb('shell', 'cmd', 'statusbar', 'expand-notifications')
        time.sleep(2)
        save_ongoing_notification()
        adb('shell', 'cmd', 'statusbar', 'collapse')
        tap('예시 지우기', wait_for('예시 지우기'))
        wait_for('예시 상시알림을 지웠습니다.')
        tap('새 예약 알림 예시', wait_for('새 예약 알림 예시'))
        wait_for('새 예약 예시 알림 표시 요청')
        adb('shell', 'cmd', 'statusbar', 'expand-notifications')
        source = wait_for('새 예약이 들어왔어요')
        source = expand_card(source, '새 예약이 들어왔어요')
        assert '예시 고객' in source and '예시 차량' in source and '비공개' in source
        assert '예약 승인' in source and '예약 거절' in source, 'Native reservation actions missing'
        save('new-booking-notification', source)
        tap('새 예약이 들어왔어요 · 예시', source)
        source = wait_for('예약 상세')
        assert '예시 고객' in source and 'BMW 520d' in source
        save('notification-open-detail', source)
set_appearance('yes')
for screen, label in [('booking', '정비 예약'), ('mypage', '마이페이지')]:
    adb('shell', 'am', 'force-stop', 'kr.promotors.app')
    adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', screen)
    source = wait_for(label)
    assert '실제 발송 없음' in source, 'Dark-mode QA disclosure absent'
    save(screen + '-dark', source)
    results.append({'screen': screen, 'systemAppearance': 'dark', 'nativeViews': True, 'webViewCount': 0})
set_appearance('no')
logs = adb('logcat', '-d', '-s', 'ReactNativeJS').decode('utf8')
assert 'PROMOTORS_NATIVE_QA_READY' in logs, 'Native QA readiness marker absent'
assert not re.search(r'operationalRequests["\\: ]+[1-9]', logs), 'QA made a production network request'
(output / 'verification.json').write_text(json.dumps({'screens': results, 'osPermissionApp': '프로모터스', 'automaticPermissionAndConnection': True, 'operationalRequests': 0, 'physicalPushDelivery': 'not-tested', 'emulatorLauncherRecoveries': launcher_recoveries}, ensure_ascii=False, indent=2), encoding='utf8')
print('Independent Android native UI and OS permission verified; no real push sent.')
