import AppKit

let path = CommandLine.arguments[1]
struct Mark: Decodable { let background: String; let palette: Palette }
struct Palette: Decodable { let ink: String }
let master = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("../../../../resources/styles/builtin/assets/brand/mark.json")
    .standardizedFileURL
let mark = try JSONDecoder().decode(Mark.self, from: Data(contentsOf: master))
func color(_ hex: String, alpha: CGFloat = 1) -> NSColor {
    let rgb = UInt32(hex.dropFirst(), radix: 16)!
    return NSColor(
        calibratedRed: CGFloat((rgb >> 16) & 255) / 255,
        green: CGFloat((rgb >> 8) & 255) / 255,
        blue: CGFloat(rgb & 255) / 255,
        alpha: alpha
    )
}

// Finder pins this image to the top-left of the icon view. Match the styled
// window content so the dashed arrow sits between the two large icons.
let width = 800
let height = 460
let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .calibratedRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

color(mark.background).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

// Icon centers are (200, 220) and (600, 220) from the top of the view.
let arrowY = CGFloat(height - 220)
let tip = NSPoint(x: 508, y: arrowY)
color(mark.palette.ink, alpha: 0.42).setStroke()

let shaft = NSBezierPath()
shaft.move(to: NSPoint(x: 292, y: arrowY))
shaft.line(to: NSPoint(x: tip.x - 18, y: tip.y))
shaft.lineWidth = 2.4
shaft.lineCapStyle = .round
shaft.setLineDash([7, 6], count: 2, phase: 0)
shaft.stroke()

let head = NSBezierPath()
head.move(to: NSPoint(x: tip.x - 20, y: tip.y + 11))
head.line(to: tip)
head.line(to: NSPoint(x: tip.x - 20, y: tip.y - 11))
head.lineWidth = 2.4
head.lineCapStyle = .round
head.lineJoinStyle = .round
head.stroke()

NSGraphicsContext.restoreGraphicsState()
try FileManager.default.createDirectory(
    at: URL(fileURLWithPath: path).deletingLastPathComponent(),
    withIntermediateDirectories: true
)
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
