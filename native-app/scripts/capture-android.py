import json
import os
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'qa-results' / 'android'
output.mkdir(parents=True, exist_ok=True)

def adb(*args):
    return subprocess.check_output(['adb', *args])

def hierarchy():
    adb('shell', 'uiautomator', 'dump', '/sdcard/pm-ui.xml')
    return adb('shell', 'cat', '/sdcard/pm-ui.xml').decode('utf8')

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

adb('install', '-r', str(root / 'android/app/build/outputs/apk/debug/app-debug.apk'))
results = []
for screen, label in [('booking', '정비 예약'), ('mypage', '마이페이지'), ('admin', '예약관리'), ('notifications', '앱 알림 설정')]:
    adb('shell', 'am', 'force-stop', 'kr.promotors.app')
    adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', screen)
    source = wait_for('실제 발송 없음')
    source = wait_for(label)
    save(screen, source)
    results.append({'screen': screen, 'nativeViews': True, 'webViewCount': 0})
    if screen == 'admin':
        adb('shell', 'pm', 'grant', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
        tap('상시알림 예시', source)
        time.sleep(2)
        adb('shell', 'cmd', 'statusbar', 'expand-notifications')
        time.sleep(2)
        save('booking-ongoing-notification')
        adb('shell', 'cmd', 'statusbar', 'collapse')

adb('shell', 'pm', 'revoke', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS')
adb('shell', 'pm', 'clear-permission-flags', 'kr.promotors.app', 'android.permission.POST_NOTIFICATIONS', 'user-set', 'user-fixed')
adb('shell', 'am', 'force-stop', 'kr.promotors.app')
adb('shell', 'am', 'start', '-n', 'kr.promotors.app/.MainActivity', '--es', 'qaScreen', 'notifications', '--ez', 'requestOsPermission', 'true')
source = wait_for('실제 발송 없음')
tap('앱 알림 연결', source)
source = wait_for('com.android.permissioncontroller')
assert 'com.android.permissioncontroller' in source, 'Native Android permission dialog absent'
assert '알림을 보내' in source or 'notifications' in source.lower(), 'Notification permission text absent'
save('os-notification-permission', source)
logs = adb('logcat', '-d', '-s', 'ReactNativeJS').decode('utf8')
assert 'PROMOTORS_NATIVE_QA_READY' in logs, 'Native QA readiness marker absent'
assert not re.search(r'operationalRequests["\\: ]+[1-9]', logs), 'QA made a production network request'
(output / 'verification.json').write_text(json.dumps({'screens': results, 'osPermissionApp': '프로모터스', 'operationalRequests': 0, 'physicalPushDelivery': 'not-tested'}, ensure_ascii=False, indent=2), encoding='utf8')
print('Independent Android native UI and OS permission verified; no real push sent.')
