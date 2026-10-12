import AppKit
import Foundation

// Ignore the system status bar and home indicator. A blank web view is not a successful launch.
let screenshot = URL(fileURLWithPath: CommandLine.arguments[1])
guard let data = try? Data(contentsOf: screenshot), let bitmap = NSBitmapImageRep(data: data) else {
    fputs("Screenshot cannot be read\n", stderr)
    exit(1)
}
var samples = 0
var contentPixels = 0
for y in stride(from: bitmap.pixelsHigh / 10, to: bitmap.pixelsHigh * 9 / 10,
                by: max(1, bitmap.pixelsHigh / 100)) {
    for x in stride(from: bitmap.pixelsWide / 20, to: bitmap.pixelsWide * 19 / 20,
                    by: max(1, bitmap.pixelsWide / 100)) {
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { continue }
        samples += 1
        if min(color.redComponent, color.greenComponent, color.blueComponent) < 0.90 {
            contentPixels += 1
        }
    }
}
let ratio = samples > 0 ? Double(contentPixels) / Double(samples) : 0
print("Nonblank content sample ratio: \(ratio)")
exit(ratio >= 0.005 ? 0 : 1)
