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


def verify(file, density_dpi):
    nodes = list(ET.parse(file).iter('node'))
    logo = bounds(next((node for node in nodes if node.get('content-desc') == '프로모터스 PRO MOTORS 수입차 정비 전문'), None))
    viewport = bounds(next((node for node in nodes if node.get('class') == 'android.widget.ScrollView'), None))
    reserve = bounds(next((node for node in nodes if node.get('resource-id', '').endswith('home-reserve') or node.get('content-desc') == '정비 예약'), None))
    asset = pathlib.Path(__file__).resolve().parents[1] / 'assets/logo-lockup.png'
    width, height = struct.unpack('>II', asset.read_bytes()[16:24])
    errors = []
    valid_density = re.fullmatch(r'[1-9][0-9]{0,4}', str(density_dpi)) and int(density_dpi) <= 10000
    scale = int(density_dpi) / 160 if valid_density else None
    if scale is None:
        errors.append('HOME_DISPLAY_DENSITY_INVALID')
    if not logo or not viewport:
        errors.append('HOME_LOGO_OR_VIEWPORT_MISSING')
    else:
        actual_width, actual_height = logo[2] - logo[0], logo[3] - logo[1]
        if actual_height <= 0 or abs(actual_width / actual_height / (width / height) - 1) > 0.03:
            errors.append('HOME_LOGO_CLIPPED_OR_STRETCHED')
        if not (viewport[0] <= logo[0] < logo[2] <= viewport[2] and viewport[1] <= logo[1] < logo[3] <= viewport[3]):
            errors.append('HOME_LOGO_OUTSIDE_VIEWPORT')
        if scale is not None:
            # style.css:3961-3963: 20dp panel inset, left-aligned logo, min(350dp, 100%).
            tolerance = max(2, scale)
            expected_left = viewport[0] + 20 * scale
            expected_width = min(350 * scale, viewport[2] - viewport[0] - 40 * scale)
            if abs(logo[0] - expected_left) > tolerance:
                errors.append('HOME_LOGO_LEFT_INSET_MISMATCH')
            if expected_width <= 0 or abs(actual_width - expected_width) > tolerance:
                errors.append('HOME_LOGO_WIDTH_CAP_MISMATCH')
    if not reserve or not viewport or not (viewport[0] <= reserve[0] < reserve[2] <= viewport[2] and viewport[1] <= reserve[1] < reserve[3] <= viewport[3]):
        errors.append('HOME_RESERVATION_BUTTON_NOT_FULLY_VISIBLE')
    return {'passed': not errors, 'errors': errors, 'logoBounds': logo, 'viewportBounds': viewport, 'reserveBounds': reserve, 'sourceAspect': width / height, 'densityDpi': int(density_dpi) if valid_density else None}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: check-home-layout.py HOME_XML DENSITY_DPI')
    result = verify(sys.argv[1], sys.argv[2])
    print(json.dumps(result))
    sys.exit(0 if result['passed'] else 1)
