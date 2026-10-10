package app.worldlet.android

import app.worldlet.kit.AccountIssue
import app.worldlet.kit.AttentionGroup
import app.worldlet.kit.AttentionItem
import app.worldlet.kit.AttentionSnapshot
import app.worldlet.kit.Conversation
import app.worldlet.kit.ItemFox
import app.worldlet.kit.LiveTurn
import app.worldlet.kit.PhoneApplet
import app.worldlet.kit.PhoneWidget
import app.worldlet.kit.Turn
import app.worldlet.kit.WidgetStateEntry
import java.time.Instant

/**
 * Demo mode shows a fixed Center and conversation without a computer or network, for the UI tests and screenshots,
 * the same sample data as the iPhone's `-demo`: `adb shell am start -n app.worldlet.android/.MainActivity --ez demo true
 * [--es page applets|now|later] [--es card t1] [--es applet mail] [--ez live true]` in a debuggable build. Try the demo on
 * the pairing screen shows the same data in any build, for anyone without Worldlet on a computer yet (and Play review);
 * leaving it from Settings goes back to pairing. Nothing here is real data, and the demo never contacts the relay.
 */
object Demo {
    /** [page] is the Center's layer at start (applets, now or later), [card] an item whose card opens, [applet] an Applet
     * whose page opens; [tried] is Try the demo, where Fox answers each line with [REPLY]. */
    /** [order] shows the Order button, as a computer that takes Orders does (`--ez order true`). */
    data class Options(val page: String? = null, val card: String? = null, val live: Boolean = false, val applet: String? = null, val tried: Boolean = false, val order: Boolean = false)

    /** What Fox says to a line typed in the demo, since no computer runs its turn (the iPhone's words). */
    const val REPLY = "This is the demo, so I can't act on that. With Worldlet running on your computer, I answer here and your computer does the work."

    /** A reply Fox is still streaming (`--ez live true`). */
    fun live() = LiveTurn(at = at(0.0), id = "demo-live", user = "What's on my plate this afternoon?",
        steps = listOf("Reading your calendar", "Checking your mail"),
        text = "You have the **design review** at 10:45, then a quiet afternoon. Sam is waiting on the venue", done = false)

    private fun at(minutes: Double) = Instant.now().plusSeconds((minutes * 60).toLong()).toString()

    private fun item(
        id: String, group: AttentionGroup, title: String, action: String, context: String, start: Double? = null,
        level: Int = 2, snoozed: Boolean = false, fact: String? = null, summary: String? = null, source: String? = null,
        art: String? = null, fox: ItemFox? = null, applet: String? = null,
    ) = AttentionItem(id, listOf(id), group, title, action, context, start?.let(::at), "", level, snoozed, fact, summary, source, art, fox, applet)

    fun attention() = AttentionSnapshot(at = at(0.0), now = listOf(
        item("e1", AttentionGroup.Event, "Calendar", "Design review with Ada", "Bring the onboarding screenshots.", start = 45.0, level = 4,
            summary = "Ada moved the review to **this morning** and asked for the onboarding screenshots.\n- **Bring the screenshots** from this morning's build.\n- The invite has the new room.",
            source = "google-calendar", art = "scene-team-meeting", applet = "calendar",
            fox = ItemFox("Shall we get ready for this?", "Help prepare", listOf(
                ItemFox.FoxTurn("Help prepare", "Ada asked for the **onboarding screenshots**. I found them in Downloads from this morning and attached them to the invite. The review moved to **Room 4B**.", false, at(-3.0)),
            ))),
        item("e2", AttentionGroup.Event, "Calendar", "Dentist appointment", "Dr. Lee, 22 Mission St.", start = 60.0 * 26, source = "google-calendar", art = "scene-dental-appointment", applet = "calendar"),
        item("t1", AttentionGroup.NeedsAction, "Mail", "Reply to Sam about the venue", "Sam needs an answer by Friday to hold the date.", level = 3,
            fact = "Due Friday · 5:00 PM",
            summary = "Sam found a venue for the team dinner and **needs a yes by Friday** to hold the date.\n- It seats 14 and is near the office.\n- **Reply to Sam** with a yes or another date.",
            source = "gmail", art = "scene-restaurant-booking", applet = "mail", fox = ItemFox("Want me to help with the next step?", "Help me do it", emptyList())),
        item("t2", AttentionGroup.NeedsAction, "GitHub", "Review the pairing pull request", "Two checks passed; one review requested from you.",
            fact = "Found 2 hr. ago", source = "github", art = "do-something"),
        item("u1", AttentionGroup.Unseen, "Weather", "Rain this afternoon", "Showers from 3 PM; take an umbrella for the walk home.", level = 1,
            fact = "Updated 1 hr. ago", art = "scene-weather-rain"),
    ), later = listOf(
        item("l1", AttentionGroup.NeedsAction, "Reminders", "Renew the passport", "Expires in March.", snoozed = true, fact = "Back tomorrow · 9:00 AM", art = "scene-passport"),
        item("l2", AttentionGroup.Unseen, "Mail", "Newsletter: spring travel deals", "Fares to Tokyo dropped this week.", fact = "Found yesterday", applet = "mail"),
        item("l3", AttentionGroup.Event, "Calendar", "Book club", "Chapter 7 and 8.", start = 60.0 * 24 * 5, art = "scene-book-club"),
    ), accounts = listOf(AccountIssue("google-calendar", "Calendar", AccountIssue.Action.Reconnect)), applets = applets())

    /** The Applet world: only Applets that work on the phone (owner request 2026-10-07), the person's own first (the
     * Getty guide, a website they made into an Applet, an ongoing thing), then the rest, with every lamp. */
    private fun applets() = listOf(
        PhoneApplet("widget:wgt-gettydemo1", "Getty Center today", PhoneApplet.Section.Live, PhoneApplet.State.Ready, widget = "wgt-gettydemo1", mine = "page"),
        PhoneApplet("site-demotldraw01", "tldraw", PhoneApplet.Section.Places, PhoneApplet.State.Ready, line = "Website", mine = "site", url = "https://www.tldraw.com/"),
        PhoneApplet("job-dietdemo0001", "#diet-and-health", PhoneApplet.Section.Jobs, PhoneApplet.State.Ready, line = "OpenClaw · Discord · 42 messages · last yesterday", mine = "conversation"),
        PhoneApplet("mail", "Mail", PhoneApplet.Section.Live, PhoneApplet.State.Busy, line = "Reading Mail…",
            recent = listOf(PhoneApplet.Line("Checked 12 new emails", at(-40.0)), PhoneApplet.Line("Saved Sam's venue question to Worth Doing", at(-25.0)),
                PhoneApplet.Line("Reading Mail…", at(-1.0))),
            fox = ItemFox("", "", listOf(ItemFox.FoxTurn("Anything urgent in my inbox?", "Only **Sam's venue question** needs you, by Friday. The rest can wait.", false, at(-12.0)))),
            url = "https://mail.google.com/mail/u/0/"),
        PhoneApplet("calendar", "Calendar", PhoneApplet.Section.Live, PhoneApplet.State.Failed, line = "Sign-in expired",
            recent = listOf(PhoneApplet.Line("Moved the design review to 10:45", at(-90.0))), url = "https://calendar.google.com/"),
        PhoneApplet("github", "GitHub", PhoneApplet.Section.Accounts, PhoneApplet.State.Ready, line = "One review requested",
            recent = listOf(PhoneApplet.Line("Found a review request on the pairing pull request", at(-120.0))), url = "https://github.com/"),
        PhoneApplet("notion", "Notion", PhoneApplet.Section.Accounts, PhoneApplet.State.Off, line = "Paused", url = "https://www.notion.so/"),
        PhoneApplet("youtube", "YouTube", PhoneApplet.Section.Places, PhoneApplet.State.Ready, url = "https://www.youtube.com/"),
        PhoneApplet("google-maps", "Maps", PhoneApplet.Section.Places, PhoneApplet.State.Ready, url = "https://www.google.com/maps/"),
    )

    fun conversation() = Conversation(at = at(0.0), name = "Fox", messages = listOf(
        Turn("1", Turn.Role.User, "What should I do before the design review?", at(-6.0)),
        Turn("2", Turn.Role.Fox, "Ada asked for the **onboarding screenshots**. They are in your Downloads folder from this morning; I can attach them to the invite.", at(-5.0)),
        Turn("3", Turn.Role.User, "Yes please, and remind me ten minutes before.", at(-2.0)),
        Turn("4", Turn.Role.Fox, "Done. The screenshots are on the invite, and I'll nudge you at 10:35.", at(-1.0)),
    ))

    /** A small widget, a guide for a day at the Getty Center, ticked off in its own local storage. Its page carries a
     * short stand-in for the computer's prelude (core/artifacts/widgets.ts widgetDocument): storage from
     * `WorldletAndroid.seed()`, reports through `WorldletAndroid.post`. */
    fun widgets() = listOf(PhoneWidget(
        id = "wgt-gettydemo1", title = "Getty Center today", blurb = "Four stops, from the tram to the Central Garden.",
        color = "#9a6b3f", endsAt = Instant.now().plusSeconds(6 * 3600).toString(), pinned = false, updatedAt = at(-30.0), version = 1,
        page = GETTY, state = mapOf("stop-tram" to WidgetStateEntry("1", Instant.now().minusSeconds(1200).toEpochMilli().toDouble())),
    ))

    private val GETTY = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>(()=>{const a=window.WorldletAndroid;let s={};try{s=JSON.parse(a.seed())}catch(e){}
const m=new Map(Object.entries(s.state||{}));let t=0;const send=v=>{try{a.post(JSON.stringify(v))}catch(e){}};
const changed=()=>{if(!t)t=setTimeout(()=>{t=0;send({state:Object.fromEntries(m)})},120)};
const api={getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v));changed()},
removeItem:k=>{if(m.delete(String(k)))changed()},clear:()=>{m.clear();changed()},key:i=>[...m.keys()][i]??null,get length(){return m.size}};
try{Object.defineProperty(window,'localStorage',{value:api,configurable:true})}catch(e){}
if(s.scroll>0)addEventListener('load',()=>scrollTo(0,s.scroll));
let r=0;addEventListener('scroll',()=>{clearTimeout(r);r=setTimeout(()=>send({scroll:Math.round(scrollY)}),300)},{passive:true});})();</script>
<style>body{margin:0;padding:20px;font:16px system-ui,sans-serif;background:#f6f1e7;color:#3b2f24}h1{font-size:22px;margin:0 0 4px}
p{margin:0 0 16px;color:#7a6a58}label{display:flex;gap:12px;align-items:center;padding:14px;margin-bottom:10px;background:#fff;border-radius:12px;border:1px solid #e6dccb}
input{width:22px;height:22px;accent-color:#9a6b3f}b{display:block}small{color:#7a6a58}</style></head><body>
<h1>Getty Center today</h1><p>Tick each stop as you go.</p><div id="stops"></div>
<script>const stops=[["stop-tram","Tram up the hill","10:00 AM · Lower tram station"],["stop-irises","Van Gogh's Irises","West Pavilion, upper level"],
["stop-garden","Central Garden","Walk down the zigzag path"],["stop-cactus","Cactus Garden view","South promontory, at sunset"]];
const list=document.getElementById('stops');
for(const [key,name,where] of stops){const label=document.createElement('label');const box=document.createElement('input');box.type='checkbox';
box.checked=localStorage.getItem(key)==='1';box.onchange=()=>box.checked?localStorage.setItem(key,'1'):localStorage.removeItem(key);
const text=document.createElement('span');text.innerHTML='<b></b><small></small>';text.querySelector('b').textContent=name;text.querySelector('small').textContent=where;
label.append(box,text);list.append(label);}</script></body></html>"""
}
