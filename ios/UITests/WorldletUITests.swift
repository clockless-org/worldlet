import XCTest

/// Simulator UI tests (the `iOS` workflow runs them on every iOS change). They drive the app the way a person does,
/// by tapping what is on screen, and use `-demo` data (App/Demo.swift), so no computer, relay or network is needed.
final class WorldletUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch(_ arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = arguments
        app.launch()
        return app
    }

    /// The first element whose label or identifier contains this text: SwiftUI decides whether a view is a text, a
    /// button or a text view, and a row's label joins its lines.
    private func element(_ app: XCUIApplication, _ text: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR identifier == %@", text, text)).firstMatch
    }

    private func waitGone(_ element: XCUIElement, _ seconds: TimeInterval = 5) -> Bool {
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: element)
        return XCTWaiter.wait(for: [gone], timeout: seconds) == .completed
    }

    /// A swipe the length a person makes, between two heights on the screen (0 is the top), down the middle of the
    /// Center.
    private func swipe(_ app: XCUIApplication, from: CGFloat, to: CGFloat) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: to)))
    }

    /// A segment of the layer tabs at the top, the system's segmented control: 0 the Applet world, 1 Now, 2 Later.
    private func tab(_ app: XCUIApplication, _ index: Int) -> XCUIElement {
        app.segmentedControls.firstMatch.buttons.element(boundBy: index)
    }

    private func hittable(_ element: XCUIElement, _ seconds: TimeInterval = 5) -> Bool {
        let shown = expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: element)
        return XCTWaiter.wait(for: [shown], timeout: seconds) == .completed
    }

    /// An unpaired iPhone opens on pairing: scan the computer's code, or paste the link.
    func testUnpairedOpensOnPairing() {
        let app = launch()
        XCTAssert(element(app, "Worldlet on your iPhone").waitForExistence(timeout: 10))
        XCTAssert(element(app, "Paste pairing link").exists)
        XCTAssertFalse(element(app, "Talk to").exists)
    }

    /// The Order button (owner request 2026-10-06) stands on its own left of Fox's bar only while the computer takes
    /// Orders.
    func testOrderButtonOnlyWhenTheComputerTakesOrders() {
        let app = launch(["-demo", "-order"])
        let order = app.buttons["foxOrder"]
        XCTAssert(order.waitForExistence(timeout: 10))
        XCTAssertEqual(order.label, "Order")
        XCTAssertLessThanOrEqual(order.frame.maxX, app.buttons["foxAvatar"].frame.minX, "left of the bar, outside it")
        app.terminate()
        let plain = launch(["-demo"])
        XCTAssert(element(plain, "Reply to Sam about the venue").waitForExistence(timeout: 10))
        XCTAssertFalse(plain.buttons["foxOrder"].exists)
    }

    /// Without a computer, Try the demo on the pairing screen opens the sample Center; leaving it from Settings goes back
    /// to pairing.
    func testTryTheDemo() {
        let app = launch()
        let demo = app.buttons["try-demo"]
        XCTAssert(demo.waitForExistence(timeout: 10))
        demo.tap()
        XCTAssert(element(app, "Reply to Sam about the venue").waitForExistence(timeout: 10))
        app.buttons["Settings"].tap()
        let leave = app.buttons["Leave the demo"]
        XCTAssert(leave.waitForExistence(timeout: 5))
        leave.tap()
        XCTAssert(element(app, "Worldlet on your iPhone").waitForExistence(timeout: 10))
    }

    /// Now shows the computer's items and the account to reconnect; a row opens its card with Fox's line about it and
    /// the option it offers. Dismiss sends the card off and brings down the next item's (the item stays), and a tap
    /// beside the card closes it.
    func testNowAndCard() {
        let app = launch(["-demo"])
        let row = element(app, "Reply to Sam about the venue")
        XCTAssert(row.waitForExistence(timeout: 10))
        XCTAssert(element(app, "Connect Calendar on your computer").exists)
        row.tap()
        let dismiss = app.buttons["Dismiss"]
        XCTAssert(dismiss.waitForExistence(timeout: 5), "the card opens")
        XCTAssert(element(app, "Want me to help with the next step?").exists, "Fox talks about the open item")
        XCTAssert(app.buttons["Help me do it"].exists, "with the option it offers")
        XCTAssertFalse(element(app, "GitHub").exists)
        dismiss.tap()
        XCTAssert(element(app, "GitHub").waitForExistence(timeout: 5), "the next item's card comes down")
        XCTAssert(row.exists, "the dismissed item stays")
        let beside = app.buttons["Close the card"].frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: beside.midX, dy: beside.maxY - 24)).tap()
        XCTAssert(waitGone(dismiss), "a tap beside the card closes it")
        // So does a tap on the empty space beside Fox's input bar.
        row.tap()
        XCTAssert(dismiss.waitForExistence(timeout: 5))
        let fox = app.buttons["foxAvatar"].frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: fox.minX / 2, dy: fox.midY)).tap()
        XCTAssert(waitGone(dismiss), "a tap beside the input bar closes the card")
        XCTAssertFalse(app.buttons["Help me do it"].exists, "the dialogue returns to the main conversation")
    }

    /// Later slides up what can wait, and Now comes back.
    func testLaterPage() {
        let app = launch(["-demo"])
        XCTAssert(element(app, "Reply to Sam about the venue").waitForExistence(timeout: 10))
        tab(app, 2).tap()
        XCTAssert(element(app, "Renew the passport").waitForExistence(timeout: 5))
        tab(app, 1).tap()
        let row = element(app, "Reply to Sam about the venue")
        XCTAssert(row.waitForExistence(timeout: 5))
        // Swiping up on Now brings Later up; pulling Later down past its top returns to Now.
        swipe(app, from: 0.55, to: 0.2)
        XCTAssert(hittable(element(app, "Renew the passport")), "a swipe up shows Later")
        swipe(app, from: 0.25, to: 0.7)
        XCTAssert(hittable(row), "pulling Later down returns to Now")
    }

    /// Swiping down on Now brings the Applet world down, the person's own Applets first (owner request 2026-10-07). A
    /// tile with a website opens it in the app's own browser; holding it offers Details, the Applet's page above Fox, which says where it is.
    /// An ongoing thing's tile opens its page, and a card's "From" opens the item's Applet.
    func testAppletWorld() {
        let app = launch(["-demo"])
        let row = element(app, "Reply to Sam about the venue")
        XCTAssert(row.waitForExistence(timeout: 10))
        swipe(app, from: 0.3, to: 0.7)
        let mail = app.buttons["applet-gmail"]
        XCTAssert(hittable(mail), "a swipe down shows the Applet world")
        XCTAssert(element(app, "YOURS").exists, "the person's own Applets have their own group")
        XCTAssert(element(app, "APPLETS").exists)
        XCTAssertFalse(app.buttons["applet-apple-notes"].exists, "an Applet that works only on the computer is not here")
        let job = app.buttons["applet-job-dietdemo0001"]
        XCTAssert(hittable(job))
        job.tap()
        XCTAssert(element(app, "appletPage").waitForExistence(timeout: 5), "an ongoing thing opens its page")
        app.buttons["leaveApplet"].tap()
        XCTAssert(waitGone(element(app, "appletPage")))
        mail.press(forDuration: 1)
        let details = app.buttons["Details"]
        XCTAssert(details.waitForExistence(timeout: 5), "holding a website's tile offers its page")
        details.tap()
        XCTAssert(element(app, "appletPage").waitForExistence(timeout: 5), "Details opens the Applet's page")
        XCTAssert(app.buttons["openWebsite"].exists, "the page opens the website too")
        app.buttons["openWebsite"].tap()
        let done = app.buttons["browser-close"]
        XCTAssert(done.waitForExistence(timeout: 5), "the website opens in Worldlet's own browser, not Safari")
        XCTAssertEqual(app.state, .runningForeground)
        done.tap()
        XCTAssert(waitGone(done), "Done closes it")
        XCTAssert(element(app, "In Mail").exists, "Fox says where it is")
        XCTAssert(element(app, "Reply to Sam about the venue").exists, "the page lists the items it brought")
        app.buttons["leaveApplet"].tap()
        XCTAssert(waitGone(element(app, "appletPage")), "the pill's ✕ leaves the page")
        tab(app, 1).tap()
        XCTAssert(hittable(row))
        row.tap()
        let from = app.buttons["cardApplet"]
        XCTAssert(from.waitForExistence(timeout: 5), "the card names the item's Applet")
        from.tap()
        XCTAssert(element(app, "appletPage").waitForExistence(timeout: 5), "and opens it")
        XCTAssert(waitGone(app.buttons["Dismiss"]), "in the card's place")
    }

    /// Fox sits at the bottom in one input bar under its dialogue box, with the microphone and Send; a tap on the bar
    /// opens the keyboard, and Send or Return sends the line.
    func testFoxDialogue() {
        let app = launch(["-demo"])
        XCTAssert(element(app, "Talk to Fox").waitForExistence(timeout: 10))
        XCTAssert(element(app, "I'll nudge you at 10:35").exists, "the dialogue shows Fox's latest answer")
        let field = element(app, "foxMessage")
        XCTAssert(field.exists, "the input bar is always there")
        let send = app.buttons["foxSend"]
        XCTAssertFalse(send.isEnabled, "Send waits for text")
        let keyboard = app.keyboards.firstMatch
        // At rest the bar takes the touch itself (a hold talks), so tap where the line is rather than the field.
        let bar = field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        bar.tap()
        XCTAssert(keyboard.waitForExistence(timeout: 5), "a tap on the bar opens the keyboard")
        field.typeText("Hello")
        XCTAssert(send.isEnabled)
        send.tap()
        XCTAssert(waitGone(keyboard), "Send sends the line")
        XCTAssertFalse(send.isEnabled, "and empties it")
        // Return sends too, instead of starting a new line.
        bar.tap()
        XCTAssert(keyboard.waitForExistence(timeout: 5))
        field.typeText("Hello\n")
        XCTAssert(waitGone(keyboard), "Return sends the line")
    }

    /// A widget for now leads Now; tapping it opens its page over everything, and Done closes it.
    func testWidgetOpensAndCloses() {
        let app = launch(["-demo"])
        let row = element(app, "widget-row")
        XCTAssert(row.waitForExistence(timeout: 10), "the demo widget is on Now")
        XCTAssert(element(app, "Getty Center").exists)
        row.tap()
        let close = element(app, "widget-close")
        XCTAssert(close.waitForExistence(timeout: 5), "the widget opens")
        XCTAssertFalse(element(app, "Open it on your computer").exists, "the demo widget has its page")
        close.tap()
        XCTAssert(waitGone(close), "Done closes it")
        XCTAssert(row.waitForExistence(timeout: 5))
    }

    /// The computer button opens Settings, which in the demo offers leaving it, and Done closes it; a tap on Fox opens it
    /// too.
    func testSettingsOpensAndCloses() {
        let app = launch(["-demo"])
        let settings = app.buttons["Settings"]
        XCTAssert(settings.waitForExistence(timeout: 10))
        settings.tap()
        XCTAssert(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        XCTAssert(app.buttons["Leave the demo"].exists)
        app.navigationBars["Settings"].buttons["Done"].tap()
        XCTAssert(waitGone(app.navigationBars["Settings"]))
        app.buttons["foxAvatar"].tap()
        XCTAssert(app.navigationBars["Settings"].waitForExistence(timeout: 5), "a tap on Fox opens Settings")
        XCTAssertFalse(app.keyboards.firstMatch.exists, "not the keyboard")
        app.navigationBars["Settings"].buttons["Done"].tap()
        XCTAssert(waitGone(app.navigationBars["Settings"]))
    }
}
