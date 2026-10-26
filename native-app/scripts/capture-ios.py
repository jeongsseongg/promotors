import json
import os
import pathlib
import shutil
import subprocess
import time

root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'qa-results' / 'ios'
output.mkdir(parents=True, exist_ok=True)
app = pathlib.Path(os.environ['RUNNER_TEMP']) / 'IndependentPromotors/Build/Products/Debug-iphonesimulator/Promotors.app'
checker = pathlib.Path(os.environ['RUNNER_TEMP']) / 'verify-native-screen'
subprocess.run(['swiftc', str(root / 'scripts/verify-native-screen.swift'), '-o', str(checker)], check=True)
ongoing_only = os.environ.get('PM_CAPTURE_SCOPE') == 'ongoing'

titles = {'home': '정비예약', 'booking': '정비 예약', 'mypage': '마이페이지', 'admin': '예약관리', 'notifications': '앱 알림 설정', 'updates': '새 버전이 나왔어요', 'setup': '앱 알림이 연결됐어요', 'setup-denied': '앱 알림을 켜주세요', 'inbox': '프로모터스 알림', 'detail': '예약 상세', 'customer': '마이페이지'}

def sim(*args):
    return subprocess.check_output(['xcrun', 'simctl', *args])

devices = json.loads(sim('list', 'devices', 'available', '-j'))
available = [device for group in devices['devices'].values() for device in group]
selected = []
for kind, needle in ([('iphone', 'iPhone')] if ongoing_only else [('iphone', 'iPhone'), ('ipad', 'iPad Pro 13')]):
    selected.append((kind, next(device['udid'] for device in available if needle in device['name'])))
results = []
for kind, device in selected:
    subprocess.run(['xcrun', 'simctl', 'boot', device], check=False)
    sim('bootstatus', device, '-b')
    sim('status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
    sim('install', device, str(app))
    captures = [('admin', 'light'), ('customer', 'light')] if ongoing_only else [(screen, 'light') for screen in titles] + [(screen, 'dark') for screen in ['booking', 'mypage']]
    for screen, appearance in captures:
        sim('ui', device, 'appearance', appearance)
        assert sim('ui', device, 'appearance').decode().strip().lower().endswith(appearance), 'System appearance not applied'
        name = kind + '-' + screen + ('-dark' if appearance == 'dark' else '')
        subprocess.run(['xcrun', 'simctl', 'terminate', device, 'kr.promotors.app'], capture_output=True)
        log = output / (name + '.log')
        with log.open('wb') as handle:
            process = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console', device, 'kr.promotors.app', '-PM_NATIVE_QA_SCREEN', screen], stdout=handle, stderr=subprocess.STDOUT)
            ready = False
            for _ in range(40):
                time.sleep(2)
                source = log.read_text(errors='replace')
                if 'PROMOTORS_NATIVE_QA_READY' in source:
                    ready = True
                    break
            if not ready:
                sim('io', device, 'screenshot', str(output / (kind + '-' + screen + '-failure.png')))
                process.terminate()
                raise RuntimeError('Native iOS app not ready: ' + kind + ' ' + screen + '\n' + source[-2000:])
            time.sleep(3)
            screenshot = output / (name + '.png')
            sim('io', device, 'screenshot', str(screenshot))
            subprocess.run([str(checker), str(screenshot), titles[screen]], check=True)
            if screen == 'home':
                subprocess.run([str(checker), str(screenshot), '예약하기'], check=True)
            process.terminate()
        if '"operationalRequests":0' not in source.replace(' ', '').replace('\\"', '"'):
            raise RuntimeError('QA production-request check missing')
        if screen == 'admin':
            container = pathlib.Path(sim('get_app_container', device, 'kr.promotors.app', 'data').decode().strip())
            for presentation in ['lock', 'island']:
                rendered = container / 'Documents' / ('qa-activity-' + presentation + '.png')
                for _ in range(10):
                    if rendered.exists():
                        break
                    time.sleep(1)
                target = output / (kind + '-live-activity-' + presentation + '.png')
                shutil.copyfile(rendered, target)
                subprocess.run([str(checker), str(target), 'BMW 520d'], check=True)
            for phase in ['confirmed', 'visit', 'repair', 'completed']:
                for presentation in ['lock', 'island']:
                    rendered = container / 'Documents' / ('qa-customer-' + phase + '-' + presentation + '.png')
                    target = output / (kind + '-customer-' + phase + '-' + presentation + '.png')
                    shutil.copyfile(rendered, target)
                    subprocess.run([str(checker), str(target), '정비 진행'], check=True)
        results.append({'device': kind, 'screen': screen, 'systemAppearance': appearance, 'nativeQaReady': True, 'operationalRequests': 0})
    sim('ui', device, 'appearance', 'light')
    sim('shutdown', device)
(output / 'verification.json').write_text(json.dumps({'screens': results, 'physicalPushDelivery': 'not-tested'}, indent=2), encoding='utf8')
print('Independent iOS app rendered. Screenshots require visual review; real push not tested.')
