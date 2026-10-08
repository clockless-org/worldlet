package app.worldlet.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows
import app.worldlet.android.ui.WorldletRoot
import app.worldlet.kit.PhoneMessage
import kotlinx.serialization.json.jsonPrimitive
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's screens on demo data, on the JVM (Robolectric, no device): the same walk as the iPhone's XCUITests, each
 * step saved as a screenshot in app/build/screenshots (kept by the Android workflow as an artifact). The Windows RC
 * runs the same walk in the real app on an emulator (src/androidTest).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class DemoUiTest {
    @get:Rule val compose = createComposeRule()

    private fun show(model: AppModel) = compose.setContent { WorldletRoot(model) }
    private fun demo(page: String? = null, card: String? = null, live: Boolean = false, applet: String? = null) = AppModel(null, "Pixel", "1.0", Demo.Options(page, card, live, applet))
    private fun shot(name: String) = compose.onRoot().captureRoboImage("build/screenshots/$name.png")

    @Test
    fun pairing() {
        show(AppModel(null, "Pixel", "1.0"))
        compose.onNodeWithText("Worldlet on your phone").assertIsDisplayed()
        compose.onNodeWithTag("scan").assertIsDisplayed()
        shot("pair")
        compose.onNodeWithTag("paste").performClick()
        compose.onNodeWithText("Copy the pairing link on your computer first.").assertIsDisplayed()
    }

    @Test
    fun tryTheDemo() {
        val model = AppModel(null, "Pixel", "1.0")
        show(model)
        compose.onNodeWithTag("tryDemo").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Reply to Sam about the venue").assertIsDisplayed()
        // With no computer, Fox answers every line with the demo's note.
        compose.onNodeWithTag("foxBar").performClick()
        compose.onNodeWithTag("foxMessage").performTextInput("What is next?")
        compose.onNodeWithTag("foxSend").performClick()
        compose.waitForIdle()
        compose.onNodeWithText(Demo.REPLY, substring = true).assertIsDisplayed()
        assert(model.pending.isEmpty())
        shot("demo-tried")
        compose.onNodeWithTag("foxAvatar").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("unpair").assertDoesNotExist()
        compose.onNodeWithTag("leaveDemo").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("pairScreen").assertIsDisplayed()
        assert(model.demo == null)
    }

    @Test
    fun attentionNowAndFox() {
        show(demo())
        compose.onNodeWithTag("tabNow").assertIsSelected()
        compose.onNodeWithText("COMING UP").assertIsDisplayed()
        compose.onNodeWithText("Reply to Sam about the venue").assertIsDisplayed()
        compose.onNodeWithText("Connect Calendar on your computer").assertIsDisplayed()
        compose.onNodeWithTag("foxDialogue").assertIsDisplayed()
        shot("attention")
    }

    @Test
    fun widgetOnNow() {
        val model = demo()
        show(model)
        compose.onNodeWithTag("widget-row").assertIsDisplayed()
        // The widget's tile in the Applet world (the layer above) has the same name.
        compose.onNode(hasTestTag("widget-row") and hasText("Getty Center today")).assertIsDisplayed()
        compose.onNodeWithText("Until", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("widget-row").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("widget-view").assertExists()
        compose.onNodeWithTag("widgetClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("widget-view").assertDoesNotExist()
        // A report from the page keeps the change and leaves the others.
        model.widgetChanged("wgt-gettydemo1", mapOf("stop-tram" to "1", "stop-garden" to "1"))
        assert(app.worldlet.kit.widgetValues(model.widgets.single().state) == mapOf("stop-tram" to "1", "stop-garden" to "1"))
    }

    @Test
    fun laterPage() {
        show(demo())
        compose.onNodeWithTag("tabLater").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("tabLater").assertIsSelected()
        compose.onNodeWithText("Renew the passport").assertIsDisplayed()
        shot("later")
    }

    @Test
    fun laterPageAtStart() {
        show(demo(page = "later"))
        compose.waitForIdle()
        compose.onNodeWithTag("tabLater").assertIsSelected()
        compose.onNodeWithText("Renew the passport").assertIsDisplayed()
    }

    @Test
    fun appletWorld() {
        show(demo())
        compose.onNodeWithTag("tabApplets").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("tabApplets").assertIsSelected()
        // Only Applets that work on the phone, the person's own first (owner request 2026-10-07).
        compose.onNodeWithText("YOURS").assertIsDisplayed()
        compose.onNodeWithText("APPLETS").assertIsDisplayed()
        compose.onNodeWithTag("applet-site-demotldraw01").assertIsDisplayed()
        compose.onNodeWithTag("applet-mail").assertIsDisplayed()
        // Mail holds one Now item (Sam's venue), Calendar two but its lamp failed, so it shows the red dot instead. The
        // badge sits inside the clickable tile, whose semantics merge it away.
        compose.onNodeWithTag("appletBadge-mail", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("appletBadge-calendar", useUnmergedTree = true).assertDoesNotExist()
        shot("applets")
        // A brought conversation the person kept is one of their own.
        compose.onNodeWithText("#diet-and-health").assertExists()
        compose.onNodeWithText("WORKING NOW").assertDoesNotExist()
    }

    @Test
    fun appletTileOpensItsWebsite() {
        val model = demo(page = "applets")
        show(model)
        compose.waitForIdle()
        compose.onNodeWithTag("applet-youtube").performClick()
        compose.waitForIdle()
        // The website opens in Worldlet's own browser, never another app (owner request 2026-10-07).
        compose.onNodeWithTag("browser").assertIsDisplayed()
        assert(model.browsing?.key == "youtube") { "browsing ${model.browsing?.key}" }
        assert(Shadows.shadowOf(RuntimeEnvironment.getApplication()).nextStartedActivity == null) { "no other app opens" }
        shot("browser")
        compose.onNodeWithTag("browserClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("browser").assertDoesNotExist()
        compose.onNodeWithTag("appletPage").assertDoesNotExist()
        // An ongoing thing has no website: its tile opens its page.
        compose.onNodeWithTag("applet-job-dietdemo0001").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertIsDisplayed()
        compose.onNodeWithTag("appletOpen").performClick()
        compose.waitForIdle()
        val sent = model.demoSent.last()
        assert(sent is PhoneMessage.OpenApplet && sent.applet == "job-dietdemo0001") { "sent $sent" }
    }

    @Test
    fun appletTileOpensItsPage() {
        val model = demo(page = "applets")
        show(model)
        compose.waitForIdle()
        compose.onNodeWithTag("applet-mail").performTouchInput { longClick() }
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertIsDisplayed()
        compose.onNodeWithTag("appletWebsite").assertIsDisplayed()
        compose.onNodeWithText("FROM HERE").assertIsDisplayed()
        compose.onNodeWithText("RECENT").assertExists()
        compose.onNodeWithTag("foxContext").assertIsDisplayed()
        compose.onNodeWithText("In Mail").assertIsDisplayed()
        // Fox shows the Applet's own thread, and Fox stays in view below the page.
        compose.onNodeWithText("Anything urgent in my inbox?", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("foxAvatar").assertIsDisplayed()
        shot("applet")
        compose.onNodeWithTag("appletWebsite").performClick()
        compose.waitForIdle()
        assert(model.browsing?.key == "mail") { "browsing ${model.browsing?.key}" }
        compose.onNodeWithTag("browserClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("foxContextClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertDoesNotExist()
        compose.onNodeWithTag("applet-mail").assertIsDisplayed()
    }

    @Test
    fun orderButtonOnlyWhileTheComputerTakesOrders() {
        show(AppModel(null, "Pixel", "1.0", Demo.Options(order = true)))
        compose.waitForIdle()
        // The team's round bug button stands on its own left of the bar (owner request 2026-10-06).
        compose.onNodeWithContentDescription("Order").assertIsDisplayed()
        compose.onNodeWithTag("foxBar").assertIsDisplayed()
        shot("order")
    }

    @Test
    fun noOrderButtonByDefault() {
        show(demo())
        compose.waitForIdle()
        compose.onNodeWithTag("foxOrder").assertDoesNotExist()
    }

    @Test
    fun cardChipOpensTheApplet() {
        show(demo(card = "t1"))
        compose.waitForIdle()
        compose.onNodeWithTag("cardApplet").assertIsDisplayed()
        compose.onNodeWithText("From Mail ›").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("card-t1").assertDoesNotExist()
        compose.onNodeWithTag("appletPage").assertIsDisplayed()
        // Closing the page goes back to the card it was opened from.
        compose.onNodeWithTag("appletClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertDoesNotExist()
        compose.onNodeWithTag("card-t1").assertIsDisplayed()
    }

    @Test
    fun aLineInsideAnAppletJoinsItsThread() {
        val model = demo(applet = "mail")
        show(model)
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertIsDisplayed()
        compose.onNodeWithTag("foxBar").performClick()
        compose.onNodeWithTag("foxMessage").performTextInput("Archive the newsletters")
        compose.onNodeWithTag("foxSend").performClick()
        compose.waitForIdle()
        val sent = model.demoSent.last()
        assert(sent is PhoneMessage.Tell && sent.applet == "mail" && sent.text == "Archive the newsletters") { "sent $sent" }
        val json = sent.toJson()
        assert(json["type"]?.jsonPrimitive?.content == "chat" && json["applet"]?.jsonPrimitive?.content == "mail" && json["item"] == null) { "encoded $json" }
        assert(model.pending.isEmpty()) { "the line is not in the main conversation" }
        compose.onNodeWithText("Archive the newsletters", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Working on it…").assertIsDisplayed()
    }

    @Test
    fun cardWithFoxsDialogue() {
        show(demo())
        compose.onNodeWithTag("row-t1").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("card-t1").assertIsDisplayed()
        compose.onNodeWithText("Help me do it").assertIsDisplayed()
        shot("card")
        compose.onNodeWithTag("cardClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("card-t1").assertDoesNotExist()
    }

    @Test
    fun cardWithEarlierTurn() {
        show(demo(card = "e1"))
        compose.waitForIdle()
        compose.onNodeWithTag("card-e1").assertIsDisplayed()
        compose.onNodeWithText("Help prepare", substring = true).assertExists()
        shot("fox")
    }

    @Test
    fun doneSettlesTheItemAndOpensTheNext() {
        val model = demo()
        show(model)
        compose.onNodeWithTag("row-t1").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("cardDone").performClick()
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitForIdle()
        assert(model.attention.now.none { it.id == "t1" }) { "Done takes the item out of Now" }
        compose.onNodeWithTag("card-t2").assertIsDisplayed()
    }

    @Test
    fun typingToFox() {
        val model = demo()
        show(model)
        // One bar under Fox's dialogue: at rest it says how to use it and there is nothing to send.
        compose.onNodeWithText("Tap to type · hold to speak").assertIsDisplayed()
        compose.onNodeWithContentDescription("Talk to Fox").assertIsDisplayed()
        compose.onNodeWithTag("foxSend").assertIsNotEnabled()
        compose.onNodeWithTag("foxBar").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("foxBar").assertDoesNotExist()
        compose.onNodeWithTag("foxMessage").performTextInput("What is next?")
        compose.onNodeWithTag("foxSend").assertIsEnabled()
        shot("typing")
        compose.onNodeWithTag("foxSend").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("What is next?", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Working on it…").assertIsDisplayed()
        // Sending puts the bar back to rest.
        compose.onNodeWithText("Tap to type · hold to speak").assertIsDisplayed()
    }

    @Test
    fun foxOpensSettings() {
        show(demo())
        compose.onNodeWithContentDescription("Open settings").assertIsDisplayed()
        compose.onNodeWithTag("foxAvatar").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("settingsSheet").assertIsDisplayed()
        compose.onNodeWithTag("unpair").assertIsDisplayed()
    }

    @Test
    fun streamingReply() {
        show(demo(live = true))
        compose.mainClock.advanceTimeBy(3_000)
        compose.waitForIdle()
        compose.onNodeWithTag("foxLive").assertIsDisplayed()
        compose.onNodeWithText("What's on my plate this afternoon?", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Sam is waiting on the venue", substring = true).assertIsDisplayed()
        shot("live")
    }

    @Test
    fun anotherComputersLinkAsksFirst() {
        val model = demo()
        show(model)
        model.pair("worldlet://pair?v=1&s=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&n=Office+PC")
        compose.waitForIdle()
        // Nothing changes until the person answers.
        assert(model.phase == AppModel.Phase.Paired && model.computerName == "Studio Mac" && model.widgets.isNotEmpty())
        compose.onNodeWithText("Pair with Office PC instead of Studio Mac?", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("keepPairing").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("keepPairing").assertDoesNotExist()
        assert(model.replacement == null && model.computerName == "Studio Mac" && model.widgets.isNotEmpty())
    }

    @Test
    fun settings() {
        show(demo())
        compose.onNodeWithTag("settings").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Studio Mac").assertIsDisplayed()
        compose.onNodeWithTag("unpair").assertIsDisplayed()
        shot("settings")
    }
}
