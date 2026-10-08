import AVFoundation
import SwiftUI

/// First run: scan the code from Worldlet on the computer (companion panel → iPhone), or paste its pairing link.
struct PairView: View {
    @Environment(AppModel.self) private var model
    @State private var scanning = false
    @State private var cameraDenied = false

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Image("Fox")
                .resizable()
                .scaledToFit()
                .frame(width: 150, height: 150)
                .accessibilityHidden(true)
            VStack(spacing: 10) {
                Text("Worldlet on your iPhone")
                    .font(.title.bold())
                Text("See what needs you and talk to Fox. Your computer does the work; this iPhone stays in step with it.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 8) {
                Label("Open Worldlet on your computer.", systemImage: "1.circle")
                Label("Open Fox's panel and choose Mobile.", systemImage: "2.circle")
                Label("Press Pair phone and scan the code.", systemImage: "3.circle")
            }
            .font(.callout)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 14))
            Spacer()
            if let error = model.error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }
            Button {
                Task { await openScanner() }
            } label: {
                Label("Scan pairing code", systemImage: "qrcode.viewfinder").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Button("Paste pairing link") {
                if let text = UIPasteboard.general.string { model.pair(with: text) } else { model.error = "Copy the pairing link on your computer first." }
            }
            .font(.callout)
            Button("No computer yet? Try the demo") { model.startDemo() }
                .font(.callout)
                .accessibilityIdentifier("try-demo")
        }
        .padding(24)
        .background(Palette.paper.ignoresSafeArea())
        .sheet(isPresented: $scanning) {
            NavigationStack {
                ScannerView { code in
                    scanning = false
                    model.pair(with: code)
                }
                .ignoresSafeArea()
                .navigationTitle("Scan the code")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { scanning = false } } }
            }
        }
        .alert("Camera access is off", isPresented: $cameraDenied) {
            Button("Open Settings") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Worldlet uses the camera only to scan the pairing code. You can also paste the pairing link.")
        }
    }

    private func openScanner() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: scanning = true
        case .notDetermined: if await AVCaptureDevice.requestAccess(for: .video) { scanning = true } else { cameraDenied = true }
        default: cameraDenied = true
        }
    }
}

/// A camera preview that reports the first Worldlet pairing QR code it sees.
struct ScannerView: UIViewControllerRepresentable {
    let found: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let controller = ScannerController()
        controller.found = found
        return controller
    }

    func updateUIViewController(_ controller: ScannerController, context: Context) {}

    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var found: ((String) -> Void)?
        private let session = AVCaptureSession()
        private var reported = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera),
                  session.canAddInput(input) else { return }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.addSublayer(preview)
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            view.layer.sublayers?.first?.frame = view.layer.bounds
        }

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            let session = self.session
            DispatchQueue.global(qos: .userInitiated).async { session.startRunning() }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            session.stopRunning()
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard !reported, let code = objects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue })
                .first(where: { $0.hasPrefix("worldlet://pair") }) else { return }
            reported = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            found?(code)
        }
    }
}
