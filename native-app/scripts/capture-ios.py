import json
import os
import pathlib
import subprocess
import time

root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'qa-results' / 'ios'
output.mkdir(parents=True, exist_ok=True)
app = pathlib.Path(os.environ['RUNNER_TEMP']) / 'IndependentPromotors/Build/Products/Debug-iphonesimulator/Promotors.app'
checker = pathlib.Path(os.environ['RUNNER_TEMP']) / 'verify-native-screen'
subprocess.run(['swiftc', str(root / 'scripts/verify-native-screen.swift'), '-o', str(checker)], check=True)
titles = {'booking': '정비 예약', 'mypage': '마이페이지', 'admin': '예약관리', 'notifications': '앱 알림 설정'}

def sim(*args):
    return subprocess.check_output(['xcrun', 'simctl', *args])

devices = json.loads(sim('list', 'devices', 'available', '-j'))
available = [device for group in devices['devices'].values() for device in group]
selected = []
for kind, needle in [('iphone', 'iPhone'), ('ipad', 'iPad Pro 13')]:
    selected.append((kind, next(device['udid'] for device in available if needle in device['name'])))
results = []
for kind, device in selected:
    subprocess.run(['xcrun', 'simctl', 'boot', device], check=False)
    sim('bootstatus', device, '-b')
    sim('status_bar', device, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100')
    sim('install', device, str(app))
    for screen in ['booking', 'mypage', 'admin', 'notifications']:
        subprocess.run(['xcrun', 'simctl', 'terminate', device, 'kr.promotors.app'], capture_output=True)
        log = output / (kind + '-' + screen + '.log')
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
            screenshot = output / (kind + '-' + screen + '.png')
            sim('io', device, 'screenshot', str(screenshot))
            subprocess.run([str(checker), str(screenshot), titles[screen]], check=True)
            process.terminate()
        if '"operationalRequests":0' not in source.replace(' ', '').replace('\\"', '"'):
            raise RuntimeError('QA production-request check missing')
        results.append({'device': kind, 'screen': screen, 'nativeQaReady': True, 'operationalRequests': 0})
    sim('shutdown', device)
(output / 'verification.json').write_text(json.dumps({'screens': results, 'physicalPushDelivery': 'not-tested'}, indent=2), encoding='utf8')
print('Independent iOS app rendered. Screenshots require visual review; real push not tested.')
