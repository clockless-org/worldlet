import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
import WorldletKit

/// Fox stays at the bottom, as on the computer, beside one input bar (owner request 2026-10-04): the bar runs the width of
/// the screen with the line to type, the microphone and the send button, and Fox's portrait is its own round button at
/// the bar's right, as tall as the bar, with its name badge over Fox's feet as on the computer (owner request
/// 2026-10-12); a tap on Fox opens Settings. At rest the bar is a little shorter and says "Tap to type · hold to speak":
/// a tap opens the keyboard (Return or the send button sends), and holding the bar talks. Talking works like a Telegram voice message (owner
/// request 2026-10-03): hold the microphone (or the bar) to talk and release to send; slide sideways to cancel; slide up
/// to lock, then tap send to send or ✕ to cancel. A quick tap on the microphone starts a locked recording. While it
/// records, the time and a sound wave take the line's place in the bar. The words are recognized on this iPhone only.
/// Fox's dialogue box stays above the bar (ui/companion/native-chat.ts) and follows where the person is: with an item's
/// card open it is that item's conversation (what Fox says about it, the option it offers, and the item's own turns);
/// inside an Applet's page it is that Applet's thread, with a pill above the bar that says where it is; otherwise it is
/// the main conversation. While the computer takes Orders, the team's round bug button stands on its own left of the
/// bar (`orderButton`). Holding Fox offers Talk with Fox (`TalkMode`): a spoken conversation until ✕ ends it.
struct FoxDock: View {
    @Environment(AppModel.self) private var model
    /// The item whose card is open, if any.
    let item: AttentionItem?
    /// The Applet whose page is open, if any; an open card takes precedence.
    var applet: PhoneApplet? = nil
    /// The pill's ✕: leaves the Applet's page.
    var leaveApplet: () -> Void = {}
    /// A tap on the dock's empty space (around the bar), which closes an open card.
    var blank: () -> Void = {}
    /// A tap on Fox: opens Fox's panel, which on the iPhone is Settings.
    var openPanel: () -> Void = {}
    /// Expanded, the conversation fills the screen above the bar as a chat (owner request 2026-10-05); Fold returns.
    var chat: Binding<Bool> = .constant(false)
    @State private var voice = VoiceInput()
    @State private var talk = TalkMode()
    @State private var draft = ""
    @State private var openedAt = Date()
    @State private var recording = Recording.idle
    @State private var startedAt = Date()
    @State private var pressedAt: Date?
    /// A press on the microphone (or the bar) while a locked recording runs sends it on release.
    @State private var sendOnRelease = false
    @State private var slide: CGSize = .zero
    /// The Order button is listening.
    @State private var ordering = false
    /// A short line above the Order button after it was used: sent, or nothing heard.
    @State private var orderHint: String?
    @FocusState private var focused: Bool
    /// Photos and files attached with "+", sent with the next line (owner request 2026-10-12).
    @State private var attachments: [PhoneAttachment] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var pickingPhotos = false
    @State private var pickingFiles = false
    @State private var attachProblem: String?

    enum Recording { case idle, holding, locked }

    /// How far a held recording slides sideways to be cancelled, or up to be locked.
    private let cancelDistance: CGFloat = 80
    private let lockDistance: CGFloat = 70
    /// The bar's height, a little shorter at rest; Fox's round button beside it is as tall.
    private var barHeight: CGFloat { resting ? 44 : 50 }
    /// Room under the row for the half of Fox's name badge below Fox.
    private let badgeRoom: CGFloat = 8
    /// The Order button while it listens, as on the computer.
    private static let orderRed = Color(hex: 0xC2412E)
    /// The round buttons in the bar, quiet as in Claude's, in the theme's colours (owner 2026-10-12).
    private static let buttonFill = Palette.ink.opacity(0.12)

    var body: some View {
        VStack(spacing: 14) {
            if chat.wrappedValue || Demo.enabled || focused || item != nil || place != nil || voice.listening || model.foxWorking || model.streaming != nil || recentReply {
                FoxDialogue(item: item, applet: place, openedAt: openedAt, hearing: voice.listening ? voice.transcript : nil, chat: chat)
                    .frame(maxHeight: chat.wrappedValue ? CGFloat.infinity : nil, alignment: .bottom)
                    .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .bottom)))
            }
            if let place { AppletPill(applet: place, leave: leaveApplet).transition(.opacity.combined(with: .move(edge: .bottom))) }
            if !attachments.isEmpty { attachmentChips.transition(.opacity.combined(with: .move(edge: .bottom))) }
            bar
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
        .animation(.snappy, value: recording)
        .animation(.snappy, value: resting)
        .background {
            Color.clear.contentShape(Rectangle()).onTapGesture {
                focused = false
                blank()
            }
        }
        .onChange(of: item?.id) { _, _ in openedAt = Date() }
        .onChange(of: place?.key) { _, _ in openedAt = Date() }
        .onDisappear { talk.stop() }
        // The computer stopped taking Orders (another channel, or unpaired) while the button listened.
        .onChange(of: model.takesOrders) { _, takes in
            if !takes && ordering { ordering = false; Task { await voice.cancel() } }
        }
        .animation(.snappy, value: place?.key)
        .onAppear {
            // `-recording holding|locked` shows the recording controls in the demo, without the microphone.
            switch Demo.argument("-recording") {
            case "holding": recording = .holding
            case "locked": recording = .locked
            default: break
            }
        }
        .photosPicker(isPresented: $pickingPhotos, selection: $photoItems, maxSelectionCount: PhoneAttachment.maxCount, matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            photoItems = []
            Task { for item in items { await attachPhoto(item) } }
        }
        .fileImporter(isPresented: $pickingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case let .success(urls) = result { for url in urls { attachFile(url) } }
        }
        .animation(.snappy, value: attachments)
        .alert("Can't attach", isPresented: Binding(get: { attachProblem != nil }, set: { if !$0 { attachProblem = nil } })) {
            Button("OK", role: .cancel) { attachProblem = nil }
        } message: {
            Text(attachProblem ?? "")
        }
        .alert("Voice is off", isPresented: voiceProblem) {
            Button("OK", role: .cancel) { voice.dismissProblem() }
        } message: {
            if case let .unavailable(reason) = voice.state { Text(reason) }
        }
    }

    /// Nothing typed, nothing recorded and no keyboard: the bar is a little shorter and says how to use it.
    private var resting: Bool { !focused && recording == .idle && draft.isEmpty }

    private var draftEmpty: Bool { draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// The Order button, when the computer takes Orders, then the input bar.
    private var bar: some View {
        input
        .overlay(alignment: .topLeading) {
            if let orderHint {
                Text(orderHint)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .liquidGlass(Capsule(), interactive: false)
                    .offset(y: -44)
                    .transition(.opacity)
                    .accessibilityIdentifier("foxOrderHint")
            }
        }
        .animation(.snappy, value: model.takesOrders)
        .animation(.snappy, value: orderHint)
        .glassContainer(spacing: 8)
    }

    /// The one input bar (the line, or the recording under way, the microphone and send), then Fox on its right.
    private var input: some View {
        HStack(spacing: 10) {
            // Like Claude's (owner request 2026-10-12): round buttons inside the bar, the bug at its left while the
            // computer takes Orders, the microphone and Send at its right. A tap on the microphone records with ✕ at
            // the left, a dotted sound wave, Stop (the words go into the line) and Send.
            HStack(spacing: 6) {
                if recording == .locked || talk.on { cancelButton.transition(.scale.combined(with: .opacity)) }
                else {
                    plusButton
                    if model.takesOrders { orderButton.transition(.scale.combined(with: .opacity)) }
                }
                field
                if recording == .locked { stopButton.transition(.scale.combined(with: .opacity)) } else { mic }
                sendButton
            }
            .padding(.leading, 6)
            .padding(.trailing, 6)
            .frame(height: barHeight)
            .liquidGlass(Capsule(), interactive: false)
            fox
        }
        .padding(.bottom, badgeRoom)
        .overlay(alignment: .topTrailing) {
            // Slide up to lock, above the microphone (its middle is 6 + 36 + 6 + 18 points from the bar's end, and the
            // bar ends Fox's width and the gap before the row's end).
            if recording == .holding {
                lockHint
                    .padding(.trailing, 66 - 17 + barHeight + 10)
                    .offset(y: -72 + max(-lockDistance, min(0, slide.height)) * 0.5)
            }
        }
    }

    /// Order (retired 2026-10-18: computers no longer offer it, so this stays hidden; owner request 2026-10-06): the team's own button, round with a bug, at the
    /// bar's left inside it (owner request 2026-10-12), only while the computer takes Orders (an Alpha or Dev app on a computer that can send them). One
    /// tap listens (the button turns red), a second sends what was heard to the team's Claude as an Order from the
    /// computer, never as a line for Fox. Voice only, as on the computer.
    private var orderButton: some View {
        Button(action: toggleOrder) {
            Image(systemName: "ladybug")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(ordering ? Self.orderRed : Self.buttonFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(recording != .idle)
        .animation(.snappy, value: ordering)
        .accessibilityLabel("Order")
        .accessibilityValue(ordering ? "Listening" : "")
        .accessibilityHint(ordering ? "Tap to send what you said to the team's Claude" : "Tap, say the task, then tap again")
        .accessibilityIdentifier("foxOrder")
    }

    private func toggleOrder() {
        if ordering {
            ordering = false
            haptic(.light)
            Task {
                let said = await voice.stop()
                guard !said.isEmpty else { hintOrder("I didn’t catch a task. Tap the bug to try again."); return }
                let sent = await model.order(said)
                hintOrder(sent ? "Order sent to your computer." : "The Order did not reach your computer.")
            }
            return
        }
        guard recording == .idle, !voice.listening, !talk.on else { return }
        focused = false
        orderHint = nil
        ordering = true
        haptic(.medium)
        Task {
            await voice.start(lines: model.turns.filter { $0.role == .user }.map(\.text))
            // Tapped again while the microphone was still starting, or refused.
            if !ordering { await voice.cancel() }
            if case .unavailable = voice.state { ordering = false }
        }
    }

    private func hintOrder(_ text: String) {
        orderHint = text
        Task {
            try? await Task.sleep(for: .seconds(3))
            if orderHint == text { orderHint = nil }
        }
    }

    /// The line to type. At rest a tap opens the keyboard and a hold talks, like holding the microphone; while the
    /// keyboard is up the line takes touches itself. While a recording runs, its time and wave take the line's place.
    private var field: some View {
        ZStack(alignment: .leading) {
            Color.clear.contentShape(Rectangle())
            if talk.on {
                talkStatus.transition(.opacity)
            } else if recording == .idle {
                // Return sends, as on the computer; the line does not wrap into a new one.
                TextField("Message \(model.conversation.name)", text: $draft, prompt: Text(prompt).foregroundStyle(Palette.muted.opacity(0.62)))
                    .font(.system(size: 16))
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .foregroundStyle(Palette.ink)
                    .tint(Palette.ink)
                    .allowsHitTesting(focused)
                    .accessibilityIdentifier("foxMessage")
                    .accessibilityHint(focused ? "" : "Tap to type; hold to talk to \(model.conversation.name)")
                    .transition(.opacity)
            } else {
                recordingStatus.transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        // The same press as the microphone's, after a short hold; a quick tap opens the keyboard instead.
        .gesture(talkGesture(delay: 0.3) { if !talk.on { focused = true } }, including: focused ? .subviews : .all)
    }

    private var prompt: String {
        if !focused { return "Tap to type · hold to speak" }
        return item.map { "Ask about \($0.headline)" } ?? place.map { "Ask about \($0.title)" } ?? "Ask \(model.conversation.name) anything"
    }

    /// The microphone: hold to talk, release to send; slide away to cancel, up to lock. A quick tap starts a locked
    /// recording, and a press while locked sends it.
    private var mic: some View {
        Image(systemName: recording == .idle && !talk.on ? "mic" : "waveform")
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Palette.ink)
            .frame(width: 36, height: 36)
            .background(Circle().fill(talk.on ? Palette.lantern.opacity(0.75) : recording == .idle ? Self.buttonFill : Color.red.opacity(0.75)))
            .scaleEffect(recording == .holding ? 1.3 : 1)
            .offset(recording == .holding ? CGSize(width: slide.width * 0.4, height: min(0, slide.height) * 0.4) : .zero)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: recording)
            .contentShape(Circle())
            .gesture(talkGesture(delay: 0) {})
            .accessibilityLabel(talk.phase == .speaking ? "Interrupt \(model.conversation.name)" : recording == .locked ? "Send the voice message" : "Talk to \(model.conversation.name)")
            .accessibilityHint(recording == .locked ? "" : "Hold to talk and release to send; slide sideways to cancel, up to lock")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { recording == .locked ? finish() : begin(locked: true) }
    }

    /// Sends the line typed, or the locked recording.
    private var sendButton: some View {
        let ready = recording == .locked || (recording == .idle && (!draftEmpty || !attachments.isEmpty))
        // The theme's light circle, dimmed until there is something to send, as in Claude's (owner 2026-10-12).
        return Button { recording == .locked ? finish() : send() } label: {
            Image(systemName: "arrow.up")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Palette.forest.opacity(ready ? 1 : 0.6))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Palette.ink.opacity(ready ? 1 : 0.45)))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(!ready)
        .animation(.easeOut(duration: 0.15), value: ready)
        .accessibilityLabel("Send")
        .accessibilityIdentifier("foxSend")
    }

    /// Cancels a locked recording, or ends Talk.
    private var cancelButton: some View {
        Button { cancel() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Self.buttonFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(talk.on ? "End Talk" : "Cancel the voice message")
        .accessibilityIdentifier("foxCancelVoice")
    }

    /// "+" at the bar's far left, as in Claude's (owner request 2026-10-12): attach photos or files to the next line.
    private var plusButton: some View {
        Menu {
            Button("Photos", systemImage: "photo.on.rectangle") { pickingPhotos = true }
            Button("Files", systemImage: "doc") { pickingFiles = true }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Self.buttonFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(recording != .idle || ordering)
        .accessibilityLabel("Attach")
        .accessibilityIdentifier("foxPlus")
    }

    /// What is attached, above the bar: each a small chip with its name and ✕.
    private var attachmentChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(attachments, id: \.file) { attachment in
                    HStack(spacing: 6) {
                        Image(systemName: attachment.mime.hasPrefix("image/") ? "photo" : "doc")
                        Text(attachment.name).lineLimit(1).truncationMode(.middle).frame(maxWidth: 140)
                        Button { attachments.removeAll { $0.file == attachment.file } } label: {
                            Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(attachment.name)")
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .liquidGlass(Capsule(), interactive: false)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("foxAttachments")
    }

    /// A photo is made smaller before it goes (at most 1600 points on its long side, JPEG), so it fits the relay.
    private func attachPhoto(_ item: PhotosPickerItem) async {
        guard attachments.count < PhoneAttachment.maxCount else { attachProblem = "Up to \(PhoneAttachment.maxCount) at a time."; return }
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else { attachProblem = "That photo could not be read."; return }
        let scale = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = small.jpegData(compressionQuality: 0.7), jpeg.count <= PhoneAttachment.maxBytes else { attachProblem = "That photo is too large to send."; return }
        let number = attachments.filter { $0.mime == "image/jpeg" }.count + 1
        attachments.append(PhoneAttachment(name: "Photo \(number).jpg", mime: "image/jpeg", data: jpeg))
    }

    private func attachFile(_ url: URL) {
        guard attachments.count < PhoneAttachment.maxCount else { attachProblem = "Up to \(PhoneAttachment.maxCount) at a time."; return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { attachProblem = "\(url.lastPathComponent) could not be read."; return }
        guard data.count <= PhoneAttachment.maxBytes else { attachProblem = "\(url.lastPathComponent) is too large to send (1.5 MB at most)."; return }
        let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        attachments.append(PhoneAttachment(name: url.lastPathComponent, mime: mime, data: data))
    }

    /// Stops a tapped recording and puts its words into the line to read or change before sending, as Claude's Stop.
    private var stopButton: some View {
        Button { stopToLine() } label: {
            Image(systemName: "stop.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Palette.ink)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Self.buttonFill))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stop and edit")
        .accessibilityIdentifier("foxStopVoice")
    }

    /// Talk under way, in the line's place: the wave while it listens, then what Fox is doing.
    private var talkStatus: some View {
        HStack(spacing: 10) {
            if talk.phase == .listening { SoundWave(level: voice.level, compact: true) }
            Text(talkText).font(.system(size: 15, weight: .semibold)).lineLimit(1)
        }
        .foregroundStyle(Palette.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("foxTalkStatus")
    }

    private var talkText: String {
        let name = model.conversation.name
        switch talk.phase {
        case .listening: return talk.quiet ? "Talk · listening (quiet)" : "Talk · listening…"
        case .thinking: return "\(name) is thinking…"
        case .speaking: return "\(name) is speaking · tap the mic to interrupt"
        case .off: return ""
        }
    }

    /// Talk with Fox from Fox's menu: on until ✕, Fox's menu again, or leaving the app.
    private func toggleTalk() {
        if talk.on { talk.stop(); return }
        guard recording == .idle, !ordering, !voice.listening else { return }
        focused = false
        haptic(.medium)
        talk.start(voice: voice, model: model) { say($0) }
    }

    /// Slide up to lock, above the held microphone.
    private var lockHint: some View {
        VStack(spacing: 3) {
            Image(systemName: slide.height <= -lockDistance * 0.6 ? "lock.fill" : "lock.open")
            Image(systemName: "chevron.up").font(.system(size: 10, weight: .bold))
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(Palette.ink)
        .frame(width: 34, height: 58)
        .liquidGlass(Capsule(), interactive: false)
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    /// The recording under way, in the line's place: a red dot and the time, the wave, and while held how to cancel.
    @ViewBuilder private var recordingStatus: some View {
        if recording == .locked {
            DottedWave(voice: voice)
                .frame(maxWidth: .infinity)
                .accessibilityLabel("Listening")
        } else {
            heldStatus
        }
    }

    /// A held recording: the time, the wave and how to cancel, as in Telegram.
    private var heldStatus: some View {
        HStack(spacing: 10) {
            TimelineView(.periodic(from: startedAt, by: 0.5)) { context in
                let seconds = max(0, Int(context.date.timeIntervalSince(startedAt)))
                HStack(spacing: 6) {
                    Circle().fill(Color.red).frame(width: 8, height: 8)
                        .opacity(seconds % 2 == 0 ? 1 : 0.35)
                    Text(String(format: "%d:%02d", seconds / 60, seconds % 60)).monospacedDigit()
                }
            }
            .font(.system(size: 15, weight: .semibold))
            // A narrow iPhone keeps the way to cancel and lets the wave go.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    SoundWave(level: voice.level, compact: true)
                    slideToCancel
                }
                slideToCancel
            }
        }
        .foregroundStyle(Palette.ink)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var slideToCancel: some View {
        Text("‹ Slide to cancel")
            .font(.system(size: 13, weight: .medium))
            .lineLimit(1)
            .fixedSize()
            .opacity(1 - min(1, abs(slide.width) / cancelDistance) * 0.8)
            .offset(x: slide.width * 0.3)
    }

    /// Hold to talk, as in Telegram: the press starts the recording (after `delay`, so a quick tap does `tap` instead);
    /// sliding sideways past `cancelDistance` cancels, sliding up past `lockDistance` locks it, and releasing a held
    /// recording sends it. On the microphone a quick tap starts a locked recording, and a press while locked sends.
    private func talkGesture(delay: Double, tap: @escaping () -> Void) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if pressedAt == nil {
                    let pressed = Date()
                    pressedAt = pressed
                    if recording == .locked { sendOnRelease = true; return }
                    if delay == 0 { begin() } else {
                        Task {
                            try? await Task.sleep(for: .seconds(delay))
                            if pressedAt == pressed, recording == .idle { begin() }
                        }
                    }
                }
                guard recording == .holding else { return }
                slide = value.translation
                if abs(value.translation.width) > cancelDistance { cancel() }
                else if value.translation.height < -lockDistance { lock() }
            }
            .onEnded { _ in
                let quick = Date().timeIntervalSince(pressedAt ?? Date()) < 0.3
                pressedAt = nil
                slide = .zero
                if sendOnRelease { sendOnRelease = false; finish(); return }
                switch recording {
                case .holding: if quick && delay == 0 { lock() } else { finish() }
                case .idle: if quick && delay > 0 { tap() }
                case .locked: break
                }
            }
    }

    private func begin(locked: Bool = false) {
        // The Order button has the microphone; in Talk a press interrupts Fox's voice and Talk listens itself.
        if talk.on { if talk.interrupt() { haptic(.light) }; return }
        guard !ordering else { return }
        focused = false
        startedAt = Date()
        withAnimation(.snappy) { recording = locked ? .locked : .holding }
        haptic(.medium)
        Task {
            await voice.start(lines: model.turns.filter { $0.role == .user }.map(\.text))
            // Released, cancelled or refused while the microphone was still starting.
            if recording == .idle { await voice.cancel() }
            if case .unavailable = voice.state { withAnimation(.snappy) { recording = .idle } }
        }
    }

    private func lock() {
        guard recording == .holding else { return }
        withAnimation(.snappy) { recording = .locked }
        slide = .zero
        haptic(.light)
    }

    private func finish() {
        guard recording != .idle else { return }
        withAnimation(.snappy) { recording = .idle }
        Task {
            let text = await voice.stop()
            if !text.isEmpty { say(text) }
        }
    }

    private func stopToLine() {
        guard recording == .locked else { return }
        withAnimation(.snappy) { recording = .idle }
        haptic(.light)
        Task {
            let text = await voice.stop()
            if !text.isEmpty { draft = draft.isEmpty ? text : draft + " " + text }
            focused = true
        }
    }

    private func cancel() {
        if talk.on { talk.stop(); return }
        guard recording != .idle else { return }
        withAnimation(.snappy) { recording = .idle }
        slide = .zero
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        Task { await voice.cancel() }
    }

    private func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    /// Fox's portrait as a round button at the bar's right, as tall as the bar, its name badge over its feet; a tap
    /// opens Fox's panel (Settings). Its ring breathes in lantern light while Fox works and turns red while the
    /// microphone listens.
    private var fox: some View {
        Button(action: openPanel) {
            Image("Fox").resizable().scaledToFit()
                .padding(4)
                .frame(width: barHeight, height: barHeight)
                .liquidGlass(Circle())
                .overlay {
                    if talk.on {
                        Circle().stroke(Palette.lantern, lineWidth: 2.5)
                    } else if recording != .idle {
                        Circle().stroke(Color.red.opacity(0.75), lineWidth: 2.5)
                    } else if model.foxWorking {
                        TimelineView(.animation(minimumInterval: 1 / 20)) { context in
                            let t = context.date.timeIntervalSinceReferenceDate
                            Circle().stroke(Palette.lantern.opacity(0.5 + 0.4 * sin(t * 3)), lineWidth: 2.5)
                        }
                    }
                }
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(talk.on ? "End Talk" : "Talk with \(model.conversation.name)", systemImage: talk.on ? "stop.circle" : "waveform") { toggleTalk() }
        }
        .scaleEffect(recording == .holding ? 1.06 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: recording)
        .overlay(alignment: .bottom) {
            FoxNameBadge(name: model.conversation.name, compact: true)
                .offset(y: badgeRoom + 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .accessibilityLabel("Open settings")
        .accessibilityAction(named: talk.on ? "End Talk" : "Talk with \(model.conversation.name)") { toggleTalk() }
        .accessibilityValue(model.foxWorking ? "\(model.conversation.name) is working" : model.conversation.name)
        .accessibilityIdentifier("foxAvatar")
    }

    private func send() {
        if !attachments.isEmpty {
            model.send(draft, attachments: attachments, item: item, applet: place)
            attachments = []
            draft = ""
            focused = false
            return
        }
        guard !draftEmpty else { return }
        say(draft)
        draft = ""
        focused = false
    }

    private func say(_ text: String) {
        if let item { model.say(text, about: item) } else if let place { model.say(text, in: place) } else { model.send(text) }
    }

    /// The Applet Fox is in: its page is open and no card is over it.
    private var place: PhoneApplet? { item == nil ? applet : nil }

    /// Fox answered in the main conversation a little while ago, so its box shows without being asked for.
    private var recentReply: Bool {
        guard let reply = model.turns.last(where: { $0.role == .fox }), let at = reply.date else { return false }
        return Date().timeIntervalSince(at) < 5 * 60
    }

    private var voiceProblem: Binding<Bool> {
        Binding(get: {
            if case .unavailable = voice.state { return true }
            return false
        }, set: { if !$0 { voice.dismissProblem() } })
    }
}

/// Fox's name on a honey badge: on the dialogue, and smaller over the feet of Fox's round button beside the bar.
struct FoxNameBadge: View {
    let name: String
    var compact = false

    var body: some View {
        Text(name)
            .font(.system(size: compact ? 11 : 14, weight: .semibold))
            .lineLimit(1)
            .truncationMode(.tail)
            // Beside the bar a long name stays about as wide as Fox.
            .frame(maxWidth: compact ? 60 : nil)
            .foregroundStyle(Color(hex: 0x4A3413))
            .padding(.horizontal, compact ? 8 : 14)
            .padding(.vertical, compact ? 2 : 4)
            .background(Color(hex: 0xF0C27A), in: UnevenRoundedRectangle(topLeadingRadius: 13, bottomLeadingRadius: 10, bottomTrailingRadius: 14, topTrailingRadius: 11))
            .shadow(color: Color(hex: 0x5A3A10).opacity(0.2), radius: 3, y: 2)
            .fixedSize()
    }
}

/// A tapped recording's sound wave, as Claude's: a dotted line that moves left, each moment's loudness a bar rising
/// from it, the newest at the right.
private struct DottedWave: View {
    let voice: VoiceInput
    @State private var levels: [Double] = []

    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 6
            let count = max(1, Int(size.width / step))
            let recent = levels.suffix(count)
            let start = size.width - CGFloat(recent.count) * step
            for i in 0..<count {
                let x = CGFloat(i) * step + step / 2
                let sample: Double? = x >= start ? recent[recent.startIndex + Int((x - start) / step)] : nil
                let height = max(3, CGFloat(sample ?? 0) * (size.height - 4))
                let rect = CGRect(x: x - 1.5, y: (size.height - height) / 2, width: 3, height: height)
                context.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(Palette.ink.opacity(sample == nil ? 0.45 : 0.95)))
            }
        }
        .frame(height: 28)
        .task {
            while !Task.isCancelled {
                levels.append(min(1, voice.level * 1.6))
                if levels.count > 200 { levels.removeFirst(levels.count - 200) }
                try? await Task.sleep(for: .milliseconds(70))
            }
        }
    }
}

/// The sound wave while the microphone listens, as on the computer (ui/style/components.css companion-input-wave):
/// seventeen bars that rise with how loud the person speaks, every third one tallest.
private struct SoundWave: View {
    let level: Double
    var compact = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 4) {
                ForEach(0..<(compact ? 13 : 17), id: \.self) { i in
                    let weight = i % 3 == 0 ? 1.8 : i % 3 == 1 ? 1.2 : 0.8
                    let wobble = 0.55 + 0.45 * sin(t * 9 + Double(i) * 0.9)
                    Capsule()
                        .fill(Palette.ink)
                        .frame(width: compact ? 3 : 4, height: 4 + CGFloat(level * (compact ? 11 : 16) * weight * wobble))
                }
            }
            .frame(height: compact ? 28 : 40)
            .animation(.easeOut(duration: 0.08), value: level)
        }
        .shadow(color: Palette.inkShadow, radius: 2, y: 1)
        .accessibilityLabel("Listening")
    }
}

/// One card of the dialogue: what the person said (a quiet "You · …" line), then Fox's answer, its current step while
/// it works, or the option it offers.
struct DialogueCard: Identifiable, Equatable {
    var id: String
    var user: String = ""
    var chosen = false
    var text: String
    var working = false
    var option: String = ""
    /// Fox's thinking on a streaming card (its working lines, newest last).
    var steps: [String] = []
    /// A card the computer is still streaming: its steps and words appear as they come.
    var live = false
    /// What the person's own Agent asks while the turn runs: Allow once, Always and Deny on the card.
    var approval: HarnessApproval?
}

/// What the person's own Agent asks (contracts/harness-services.ts `approvals`), as the computer's card shows it: the
/// request, its command, and Allow once / Always / Deny in the style of Fox's option; once answered, the settled line.
private struct ApprovalChoices: View {
    @Environment(AppModel.self) private var model
    let approval: HarnessApproval

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(approval.title).font(.system(size: 14, weight: .semibold))
            if !approval.detail.isEmpty {
                Text(approval.detail)
                    .font(.system(size: 13, design: .monospaced))
                    .lineLimit(6)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(hex: 0xEFEAD3), in: RoundedRectangle(cornerRadius: 8))
            }
            if let choice = model.answered[approval.id] {
                Text(choice.settled).font(.system(size: 14).italic()).foregroundStyle(Color(hex: 0x7B857C))
            } else {
                HStack {
                    Spacer()
                    ForEach(approval.choices, id: \.self) { choice in
                        Button(choice.label) { model.answer(approval, choice) }
                            .font(.system(size: 14, weight: .bold))
                            .underline()
                            .foregroundStyle(Color(hex: 0x385644))
                            .padding(.horizontal, 7)
                            .frame(minHeight: 28)
                            .accessibilityIdentifier("approval-\(choice.rawValue)")
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("foxApproval")
    }
}

/// Where Fox is: a small paper pill above Fox while an Applet's page is open; its ✕ leaves the page.
private struct AppletPill: View {
    let applet: PhoneApplet
    let leave: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            AppletGlyph(applet: applet, size: 20)
            Text("In \(applet.title)").font(.system(size: 13, weight: .semibold)).lineLimit(1)
            Button(action: leave) { Image(systemName: "xmark").font(.system(size: 10, weight: .bold)) }
                .accessibilityLabel("Leave \(applet.title)")
                .accessibilityIdentifier("leaveApplet")
        }
        .foregroundStyle(Palette.paperInk)
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .background(Palette.paper, in: Capsule())
        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
        // A container of its own, so its identifier does not replace the ✕'s.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("appletPill")
    }
}

/// Fox's dialogue box, drawn as on the computer (ui/attention/attention-preview.css "companion"): a paper card with
/// Fox's name badge and a tail toward Fox, the front card in it, and a quiet Expand on its edge. Expand opens the whole
/// conversation as a chat filling the screen above the bar, newest at the bottom; Fold returns to the bubble (owner
/// request 2026-10-05).
private struct FoxDialogue: View {
    @Environment(AppModel.self) private var model
    let item: AttentionItem?
    let applet: PhoneApplet?
    let openedAt: Date
    /// The words the microphone is hearing, while it listens.
    let hearing: String?
    let chat: Binding<Bool>

    var body: some View {
        let cards = self.cards
        Group {
            if chat.wrappedValue {
                sheet(cards)
            } else if let card = cards.last {
                front(card, expandable: cards.count > 1 || card.text.count > 200)
            }
        }
        .frame(maxWidth: chat.wrappedValue ? CGFloat.infinity : 460)
        // Opening a card or an Applet folds the chat; closing one does not, so a notification can open Fox's dialogue
        // expanded from a card (HomeView.openTarget).
        .onChange(of: item?.id) { _, id in if id != nil { chat.wrappedValue = false } }
        .onChange(of: applet?.key) { _, key in if key != nil { chat.wrappedValue = false } }
    }

    /// Expanded: the whole thread as a chat, its cards stacked with the earlier ones above the latest and scrolling, with
    /// no box around them (owner request 2026-10-05).
    private func sheet(_ cards: [DialogueCard]) -> some View {
        VStack(spacing: 0) {
            HStack {
                nameBadge
                Spacer()
                expandToggle
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(cards.dropLast()) { EarlierCard(card: $0) }
                    if let card = cards.last {
                        VStack(alignment: .leading, spacing: 6) { lines(card, capped: false) }
                            .foregroundStyle(Color(hex: 0x203B30))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(Color(hex: 0xF9F6E4), in: RoundedRectangle(cornerRadius: 20))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(hex: 0xEBE5CC)))
                            .shadow(color: Color(hex: 0x203629).opacity(0.19), radius: 8, y: 5)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 18)
            }
            .defaultScrollAnchor(.bottom)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("foxChat")
    }

    /// Fox's name on a honey badge.
    private var nameBadge: some View { FoxNameBadge(name: model.conversation.name) }

    /// Expand and Fold: a quiet paper tab, muted until pressed (owner request 2026-10-05: not History, not loud).
    private var expandToggle: some View {
        Button {
            withAnimation(.snappy) { chat.wrappedValue.toggle() }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: chat.wrappedValue ? "chevron.down" : "chevron.up").font(.system(size: 9, weight: .bold))
                Text(chat.wrappedValue ? "Fold" : "Expand")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(hex: 0x6C7A70))
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(Color(hex: 0xFFF9E7), in: Capsule())
            .overlay(Capsule().stroke(Color(hex: 0xE3D9B8)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("foxExpand")
    }

    /// What a card says: the person's line, then Fox's answer (its working line while it works) and the option it offers.
    /// In the bubble a long answer scrolls inside its card; in the expanded chat it is shown whole.
    @ViewBuilder
    private func lines(_ card: DialogueCard, capped: Bool) -> some View {
        if !card.user.isEmpty {
            (Text("You · ").fontWeight(.regular) + Text(card.chosen ? "↩ " + card.user : card.user))
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .opacity(0.62)
        }
        if card.live {
            LiveReply(card: card)
        } else if card.working {
            Text(card.text.isEmpty ? "Working on it…" : card.text + "…")
                .font(.system(size: 15).italic())
                .foregroundStyle(Color(hex: 0x7B857C))
        } else if !card.text.isEmpty {
            if capped {
                ScrollingReply(maxHeight: 150) { reply(card.text) }
            } else {
                reply(card.text)
            }
        }
        if let approval = card.approval { ApprovalChoices(approval: approval) }
        if !card.option.isEmpty, let item {
            HStack {
                Spacer()
                Button(card.option) { model.say(card.option, about: item, option: true) }
                    .font(.system(size: 14, weight: .bold))
                    .underline()
                    .foregroundStyle(Color(hex: 0x385644))
                    .padding(.horizontal, 7)
                    .frame(minHeight: 28)
            }
        }
    }

    private func front(_ card: DialogueCard, expandable: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            lines(card, capped: true)
        }
        .foregroundStyle(Color(hex: 0x203B30))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 16)
        .background { Paper() }
        .overlay(alignment: .topLeading) { nameBadge.offset(x: 22, y: -14) }
        .overlay(alignment: .topTrailing) {
            if expandable { expandToggle.offset(x: -22, y: -12) }
        }
        .compositingGroup()
        .shadow(color: Color(hex: 0x203629).opacity(0.19), radius: 8, y: 5)
        .animation(.easeOut(duration: 0.25), value: card)
    }

    private func reply(_ text: String) -> some View {
        Text(markdown(text))
            .font(.system(size: 15))
            .lineSpacing(5)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// The cards of the place Fox is talking about, oldest first; the last one is the front card.
    private var cards: [DialogueCard] {
        if let hearing {
            return [DialogueCard(id: "hearing", user: hearing.isEmpty ? "…" : hearing, text: "Listening", working: true)]
        }
        if let item { return itemCards(item) }
        if let applet { return appletCards(applet) }
        return mainCards
    }

    /// The Applet's own thread: what was said inside it, the turn streaming there, and a line still on its way.
    private func appletCards(_ applet: PhoneApplet) -> [DialogueCard] {
        var cards = (applet.fox?.turns ?? []).enumerated().map { index, turn in
            DialogueCard(id: "\(applet.key):\(index)", user: turn.user, text: turn.text, working: turn.working)
        }
        if let live = model.streaming, live.applet == applet.key {
            if cards.last?.working == true { cards.removeLast() }
            if live.done, cards.last?.text == live.text { return cards }
            cards.append(DialogueCard(id: "live:\(live.id)", user: live.user, text: live.text, working: !live.done, steps: live.steps, live: true,
                                      approval: live.asking()))
            return cards
        }
        if let line = model.appletPending[applet.key] {
            cards.append(DialogueCard(id: "\(applet.key):pending", user: line, text: "", working: true))
        }
        if cards.isEmpty {
            cards.append(DialogueCard(id: "\(applet.key):hello", text: "We're in \(applet.title). Ask me anything about it, or tell me what to do here."))
        }
        return cards
    }

    private func itemCards(_ item: AttentionItem) -> [DialogueCard] {
        let fox = item.fox
        var cards = (fox?.turns ?? []).enumerated().map { index, turn in
            DialogueCard(id: "\(item.id):\(index)", user: turn.user, chosen: turn.user == fox?.option, text: turn.text, working: turn.working)
        }
        // What Fox says as the card opens is the newest line, until a turn of this item starts or ends after it.
        let latest = fox?.turns.last
        let newer = latest.map { $0.working || (Self.date($0.at) ?? .distantPast) > openedAt } ?? false
        if let live = model.streaming, live.item == item.id {
            // The turn under way streams in place of its working line; a finished one stays until the item's turns have it.
            if cards.last?.working == true { cards.removeLast() }
            if live.done, cards.last?.text == live.text { return cards }
            cards.append(DialogueCard(id: "live:\(live.id)", user: live.user, chosen: live.user == fox?.option, text: live.text,
                                      working: !live.done, steps: live.steps, live: true, approval: live.asking()))
            return cards
        }
        if let line = model.itemPending[item.id] {
            cards.append(DialogueCard(id: "\(item.id):pending", user: line, chosen: line == fox?.option, text: "", working: true))
        } else if !newer {
            let say = fox?.say ?? Self.say(item.group)
            cards.append(DialogueCard(id: "\(item.id):say", text: say, option: fox?.option ?? ""))
        }
        return cards
    }

    /// The main conversation as cards: each of Fox's answers with the line the person said before it.
    private var mainCards: [DialogueCard] {
        var cards: [DialogueCard] = []
        var asked = ""
        for turn in model.turns.suffix(12) {
            if turn.role == .user { asked = turn.text; continue }
            cards.append(DialogueCard(id: turn.id, user: asked, text: turn.text))
            asked = ""
        }
        if let live = model.streaming, live.item == nil {
            // The turn under way streams word by word; once finished it stays until the conversation has it.
            if !(live.done && cards.last?.text == live.text) {
                cards.append(DialogueCard(id: "live:\(live.id)", user: live.user.isEmpty ? asked : live.user, text: live.text,
                                          working: !live.done, steps: live.steps, live: true, approval: live.asking()))
            }
        } else if model.foxWorking || !asked.isEmpty {
            cards.append(DialogueCard(id: "working", user: asked, text: "", working: true))
        }
        // A request from an item's thread is answered here too: a tapped notification opens this dialogue.
        if let live = model.streaming, live.item != nil, let approval = live.asking() {
            cards.append(DialogueCard(id: "approval:\(approval.id)", text: "", approval: approval))
        }
        if cards.isEmpty {
            cards.append(DialogueCard(id: "greeting", text: "Hi, I'm \(model.conversation.name). Ask me anything, or open something in the Center and we'll look at it together."))
        }
        return cards
    }

    /// What the computer's card says for an item from a computer older than the item dialogue (agent/attention/attention-preview.ts).
    static func say(_ group: AttentionGroup) -> String {
        switch group {
        case .event: "Shall we get ready for this?"
        case .needsAction: "Want me to help with the next step?"
        case .unseen: "Want to explore what this means?"
        }
    }

    static func date(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}

/// A turn the computer is streaming: Fox's thinking (its latest working line, as the computer's dialogue shows it) and
/// the reply so far, both appearing letter by letter as they arrive. The relay brings the words in bursts a few times a
/// second; the letters in between are revealed smoothly, faster when more are waiting.
private struct LiveReply: View {
    let card: DialogueCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if card.working, let step = card.steps.last {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    ThinkingDots()
                    StreamingText(text: step + (card.text.isEmpty ? "…" : ""), plain: true)
                }
                .font(.system(size: card.text.isEmpty ? 15 : 13).italic())
                .foregroundStyle(Color(hex: 0x7B857C))
            } else if card.working, card.text.isEmpty {
                HStack(spacing: 6) { ThinkingDots(); Text("Thinking…") }
                    .font(.system(size: 15).italic())
                    .foregroundStyle(Color(hex: 0x7B857C))
            }
            if !card.text.isEmpty {
                ScrollView {
                    StreamingText(text: card.text)
                        .font(.system(size: 15))
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .defaultScrollAnchor(.bottom)
                .frame(maxHeight: 220)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Text that types itself out toward `text`. A new text that continues the shown one keeps typing from where it is; any
/// other text starts over.
private struct StreamingText: View {
    let text: String
    var plain = false
    @State private var shown = 0

    var body: some View {
        let visible = String(text.prefix(shown))
        Group { if plain { Text(visible) } else { Text(markdown(visible)) } }
            .task(id: text) {
                let count = text.count
                if shown > count { shown = 0 }
                while shown < count, !Task.isCancelled {
                    // About 60 letters a second, catching up within half a second when a burst arrives.
                    shown = min(count, shown + max(1, (count - shown) / 15))
                    try? await Task.sleep(for: .milliseconds(16))
                }
            }
    }
}

/// Three dots that pulse while Fox thinks.
private struct ThinkingDots: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.35)) { context in
            let beat = Int(context.date.timeIntervalSinceReferenceDate / 0.35) % 3
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { index in
                    Circle().frame(width: 4, height: 4).opacity(index == beat ? 0.9 : 0.3)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// An earlier card, paler and smaller, stacked above the front one.
private struct EarlierCard: View {
    let card: DialogueCard

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !card.user.isEmpty {
                (Text("You · ").fontWeight(.regular) + Text(card.chosen ? "↩ " + card.user : card.user))
                    .font(.system(size: 12, weight: .semibold)).lineLimit(1).opacity(0.62)
            }
            Text(markdown(card.text)).font(.system(size: 14)).lineSpacing(3)
        }
        .foregroundStyle(Color(hex: 0x203B30))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(hex: 0xF1EFE4), in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(hex: 0xEBE5CC)))
        .shadow(color: Color(hex: 0x162A32).opacity(0.1), radius: 5, y: 3)
    }
}

/// The dialogue's paper with its tail toward Fox below it, at the input bar's right (Fox's middle is 25 points in).
private struct Paper: View {
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: 20).fill(Color(hex: 0xF9F6E4))
            RoundedRectangle(cornerRadius: 20).stroke(Color(hex: 0xEBE5CC))
            Tail().fill(Color(hex: 0xF9F6E4)).frame(width: 18, height: 11).offset(x: -(25 - 9), y: 10)
        }
    }
}

private struct Tail: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            p.closeSubpath()
        }
    }
}

/// Fox writes Markdown; inline styles and links render, block syntax stays as plain lines. Bold comes from
/// `strongSegments`, since the system parser leaves `**` against Chinese text or punctuation as asterisks.
func markdown(_ text: String) -> AttributedString {
    var shown = AttributedString()
    for segment in strongSegments(text) {
        var part = (try? AttributedString(markdown: segment.text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(segment.text)
        if segment.strong {
            for range in part.runs.map(\.range) {
                part[range].inlinePresentationIntent = (part[range].inlinePresentationIntent ?? []).union(.stronglyEmphasized)
            }
        }
        shown.append(part)
    }
    return shown
}

extension Turn {
    var date: Date? { Self.parse(at) }

    /// The computer's ISO 8601 times, with or without fractions of a second.
    static func parse(_ text: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: text) ?? ISO8601DateFormatter().date(from: text)
    }
}

/// A long reply scrolls inside its card instead of a Show more (owner feedback 2026-10-04); a small
/// down arrow at its foot says more waits below, and leaves once the end is in view.
private struct ScrollingReply<Content: View>: View {
    let maxHeight: CGFloat
    @ViewBuilder let content: Content
    @State private var contentHeight: CGFloat = 0
    @State private var offset: CGFloat = 0

    var body: some View {
        let scrolls = contentHeight > maxHeight + 1
        let below = scrolls && contentHeight - offset - maxHeight > 2
        ScrollView(.vertical, showsIndicators: false) {
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    GeometryReader { geometry in
                        Color.clear
                            .onAppear {
                                contentHeight = geometry.size.height
                                offset = -geometry.frame(in: .named("reply")).minY
                            }
                            .onChange(of: geometry.size.height) { _, height in contentHeight = height }
                            .onChange(of: geometry.frame(in: .named("reply")).minY) { _, y in offset = -y }
                    }
                }
        }
        .coordinateSpace(.named("reply"))
        .scrollDisabled(!scrolls)
        // The cap goes on the scroll view and the measured height outside it, so a short reply's box is only as tall as
        // the reply: a flexible frame outside would grow to the cap whenever there is room.
        .frame(maxHeight: maxHeight)
        .frame(height: contentHeight > 0 ? min(contentHeight, maxHeight) : nil)
        .mask {
            LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: below ? 0.8 : 1), .init(color: below ? .clear : .black, location: 1)], startPoint: .top, endPoint: .bottom)
        }
        .overlay(alignment: .bottom) {
            if below {
                Image(systemName: "arrowtriangle.down.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(Color(hex: 0x2F6B45).opacity(0.75))
                    .offset(y: 10)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityIdentifier("foxReply")
    }
}
