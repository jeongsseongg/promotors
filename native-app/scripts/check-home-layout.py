import json
import pathlib
import re
import struct
import sys
import xml.etree.ElementTree as ET


def bounds(node):
    if node is None:
        return None
    values = [int(value) for value in re.findall(r"-?\d+", node.get('bounds', ''))]
    return values if len(values) == 4 else None


def verify(file):
    nodes = list(ET.parse(file).iter('node'))
    logo = bounds(next((node for node in nodes if node.get('content-desc') == '프로모터스 PRO MOTORS 수입차 정비 전문'), None))
    viewport = bounds(next((node for node in nodes if node.get('class') == 'android.widget.ScrollView'), None))
    reserve = bounds(next((node for node in nodes if node.get('resource-id', '').endswith('home-reserve') or node.get('content-desc') == '정비 예약'), None))
    asset = pathlib.Path(__file__).resolve().parents[1] / 'assets/logo-lockup.png'
    width, height = struct.unpack('>II', asset.read_bytes()[16:24])
    errors = []
    if not logo or not viewport:
        errors.append('HOME_LOGO_OR_VIEWPORT_MISSING')
    else:
        actual_width, actual_height = logo[2] - logo[0], logo[3] - logo[1]
        if actual_height <= 0 or abs(actual_width / actual_height / (width / height) - 1) > 0.03:
            errors.append('HOME_LOGO_CLIPPED_OR_STRETCHED')
        inset_left, inset_right = logo[0] - viewport[0], viewport[2] - logo[2]
        if min(inset_left, inset_right) < 0 or abs(inset_left - inset_right) > max(3, (viewport[2] - viewport[0]) * 0.01):
            errors.append('HOME_LOGO_OUTSIDE_CENTERED_VIEWPORT')
    if not reserve or not viewport or not (viewport[0] <= reserve[0] < reserve[2] <= viewport[2] and viewport[1] <= reserve[1] < reserve[3] <= viewport[3]):
        errors.append('HOME_RESERVATION_BUTTON_NOT_FULLY_VISIBLE')
    return {'passed': not errors, 'errors': errors, 'logoBounds': logo, 'viewportBounds': viewport, 'reserveBounds': reserve, 'sourceAspect': width / height}


if __name__ == '__main__':
    result = verify(sys.argv[1])
    print(json.dumps(result))
    sys.exit(0 if result['passed'] else 1)
