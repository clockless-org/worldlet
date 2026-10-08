package app.worldlet.android

import android.content.Intent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeUp
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The real app on an Android emulator (the Windows RC runs these as `npm run test:android`): it launches in demo mode
 * (fixed sample data, no network or computer) and walks pairing, Now, an item's card with Fox's dialogue, Later and
 * the Applet world by vertical swipes, an Applet's page, typing to Fox and Settings, as the iPhone's XCUITests do.
 */
@RunWith(AndroidJUnit4::class)
class AppTest {
    @get:Rule val compose = createEmptyComposeRule()
    private var scenario: ActivityScenario<MainActivity>? = null

    private fun launch(demo: Boolean) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        scenario = ActivityScenario.launch(Intent(context, MainActivity::class.java).putExtra("demo", demo))
    }

    @After fun close() { scenario?.close() }

    @Test
    fun unpairedOpensOnPairing() {
        launch(demo = false)
        compose.onNodeWithText("Worldlet on your phone").assertIsDisplayed()
        compose.onNodeWithTag("scan").assertIsDisplayed()
        compose.onNodeWithTag("paste").assertIsDisplayed()
    }

    @Test
    fun nowCardAndFox() {
        launch(demo = true)
        compose.onNodeWithTag("tabNow").assertIsSelected()
        compose.onNodeWithText("Reply to Sam about the venue").assertIsDisplayed()
        compose.onNodeWithTag("row-t1").performClick()
        compose.onNodeWithTag("card-t1").assertIsDisplayed()
        compose.onNodeWithTag("foxOption").assertIsDisplayed()
        compose.onNodeWithTag("cardClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("card-t1").assertDoesNotExist()
    }

    @Test
    fun swipeUpToLater() {
        launch(demo = true)
        // Now scrolls to its end first; the swipes past it turn to Later, whose list then takes them.
        repeat(4) {
            compose.onNodeWithTag("centerPager").performTouchInput { swipeUp() }
            compose.waitForIdle()
        }
        compose.onNodeWithTag("tabLater").assertIsSelected()
        compose.onNodeWithText("Renew the passport").assertIsDisplayed()
        // Back down at the top of Later's list comes back to Now.
        repeat(2) {
            compose.onNodeWithTag("centerPager").performTouchInput { swipeDown() }
            compose.waitForIdle()
        }
        compose.onNodeWithTag("tabNow").assertIsSelected()
    }

    @Test
    fun swipeDownToTheAppletWorldAndOpenAnApplet() {
        launch(demo = true)
        compose.onNodeWithTag("centerPager").performTouchInput { swipeDown() }
        compose.waitForIdle()
        compose.onNodeWithTag("tabApplets").assertIsSelected()
        // The person's own Applets come first (owner request 2026-10-07); a website's tile opens its page on a long press.
        compose.onNodeWithText("YOURS").assertIsDisplayed()
        compose.onNodeWithTag("applet-mail").performTouchInput { longClick() }
        compose.onNodeWithTag("appletPage").assertIsDisplayed()
        compose.onNodeWithTag("appletWebsite").assertIsDisplayed()
        compose.onNodeWithTag("foxContext").assertIsDisplayed()
        compose.onNodeWithTag("foxAvatar").assertIsDisplayed()
        compose.onNodeWithTag("foxContextClose").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("appletPage").assertDoesNotExist()
    }

    @Test
    fun typeToFoxAndSettings() {
        launch(demo = true)
        // A tap on the bar under Fox's dialogue opens the keyboard; Fox at the bar's left opens Settings.
        compose.onNodeWithTag("foxBar").performClick()
        compose.onNodeWithTag("foxMessage").performTextInput("What is next?")
        compose.onNodeWithTag("foxSend").performClick()
        compose.onNodeWithText("What is next?", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("foxAvatar").performClick()
        compose.onNodeWithTag("unpair").assertIsDisplayed()
    }
}
