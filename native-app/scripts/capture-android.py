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
def hierarchy():
    global dump_number
    dump_number += 1
    remote = '/sdcard/pm-ui-' + str(dump_number) + '.xml'
    try:
        adb('shell', 'uiautomator', 'dump', remote)
        source = adb('shell', 'cat', remote).decode('utf8')
        return source if '<hierarchy' in source else ''
    except subprocess.CalledProcessError:
        return ''

def wait_for(label):
    for _ in range(35):
        source = hierarchy()
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
        if text in [node.get('text'), node.get('content-desc')]:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
            return
    raise RuntimeError('Native control unavailable: ' + text)

def expand_card(source, title):
    document = ET.fromstring(source)
    parents = {child: parent for parent in document.iter() for child in parent}
    anchor = next((node for node in document.iter('node') if title in node.get('text', '')), None)
    candidates = []
    while anchor is not None:
        candidates = [node for node in anchor.iter('node') if node.get('resource-id', '').endswith('/expand_button')]
        if candidates:
            break
        anchor = parents.get(anchor)
    for node in candidates:
        if node.get('resource-id', '').endswith('/expand_button'):
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
            time.sleep(1)
            return hierarchy()
    return source

def save_ongoing_notification():
    # A ticking system Chronometer never becomes idle for uiautomator's dump.
    # Verify the actual posted OS record and screenshot without stopping its clock.
    for _ in range(15):
        records = adb('shell', 'dumpsys', 'notification', '--noredact').decode('utf8')
        own = [record for record in re.split(r'(?=NotificationRecord\()', records)
               if 'pkg=kr.promotors.app' in record and '처리 대기 1건' in record]
        if own:
            record = own[0]
            assert 'BMW 520d' in record and '예시 고객' in record and '비공개' in record
            (output / 'booking-ongoing-notification.txt').write_text(record, encoding='utf8')
            (output / 'booking-ongoing-notification.png').write_bytes(adb('exec-out', 'screencap', '-p'))
            return
        time.sleep(1)
    raise RuntimeError('Actual ongoing reservation notification not posted')

adb('install', '-r', str(root / 'android/app/build/outputs/apk/debug/app-debug.apk'))
adb('shell', 'pm', 'revoke', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
adb('shell', 'pm', 'clear-permission-flags', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS', 'user-set', 'user-fixed')
adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', 'notifications', '--ez', 'requestOsPermission', 'true')
source = wait_for('실제 발송 없음')
tap('앱 알림 연결', source)
source = wait_for('com.android.permissioncontroller')
assert '프로모터스' in source, 'Native permission does not identify the app'
assert '알림을 보내' in source or 'notifications' in source.lower(), 'Notification permission text absent'
save('os-notification-permission', source)
adb('shell', 'input', 'keyevent', '4')
results = []
for screen, label in [('booking', '정비 예약'), ('mypage', '마이페이지'), ('admin', '예약관리'), ('notifications', '앱 알림 설정')]:
    adb('shell', 'am', 'force-stop', 'kr.promotors.app')
    adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', screen)
    source = wait_for('실제 발송 없음')
    source = wait_for(label)
    save(screen, source)
    results.append({'screen': screen, 'nativeViews': True, 'webViewCount': 0})
    if screen == 'booking':
        tap('프로모터스 안산점', source)
        save('booking-calendar', wait_for('다음 달'))
    if screen == 'admin':
        adb('shell', 'pm', 'grant', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
        tap('상시알림 예시', source)
        wait_for('예시 상시알림 표시 요청')
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
logs = adb('logcat', '-d', '-s', 'ReactNativeJS').decode('utf8')
assert 'PROMOTORS_NATIVE_QA_READY' in logs, 'Native QA readiness marker absent'
assert not re.search(r'operationalRequests["\\: ]+[1-9]', logs), 'QA made a production network request'
(output / 'verification.json').write_text(json.dumps({'screens': results, 'osPermissionApp': '프로모터스', 'operationalRequests': 0, 'physicalPushDelivery': 'not-tested'}, ensure_ascii=False, indent=2), encoding='utf8')
print('Independent Android native UI and OS permission verified; no real push sent.')
