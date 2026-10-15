import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 3,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let bitmap = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Screen image unavailable\n", stderr); exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
request.usesLanguageCorrection = false
do {
    try VNImageRequestHandler(cgImage: bitmap).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    let normalize: (String) -> String = { $0.components(separatedBy: .whitespacesAndNewlines).joined() }
    let source = normalize(lines.joined(separator: "\n"))
    let expected = normalize(CommandLine.arguments[2])
    guard source.contains(expected), source.contains("실제발송없음") else {
        fputs("Required native screen title or synthetic QA disclosure absent\n", stderr)
        print(lines.joined(separator: "\n")); exit(1)
    }
    print("Native screen title and synthetic QA disclosure visible: " + CommandLine.arguments[2])
} catch {
    fputs("Native screen OCR failed\n", stderr); exit(1)
}
