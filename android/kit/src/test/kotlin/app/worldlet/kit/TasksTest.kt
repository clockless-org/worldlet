package app.worldlet.kit

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** The Tasks and Today tabs' slots on the attention payload (agent/phone/payloads.ts PhoneTasks, PhoneJournalEntry),
 * owner request 2026-10-11. */
class TasksTest {
    private fun decode(json: String) = WorldletJson.decodeFromString(AttentionSnapshot.serializer(), json)

    @Test
    fun tasksAndJournalDecode() {
        val snapshot = decode("""{"v":1,"at":"","now":[],"later":[],"accounts":[],
            "tasks":{"now":[
              {"id":"t1","name":"Comparing flights","status":"Reading fares","when":"In progress","icon":"fox","progress":0.4,"lines":["Opened the airline","Found 3 fares"]},
              {"id":"t2","name":"Inbox sweep","status":"Reading Mail","when":"In progress","icon":"mail","applet":"mail","progress":3}],
             "routines":[{"id":"r1","name":"Daily news digest","status":"","when":"Tomorrow 7:00 AM","icon":"clock","every":"Every day","by":"Fox","future":true}]},
            "journal":[{"id":"j1","title":"Rain this afternoon","kind":"attention","at":"2026-10-11T15:00:00Z","text":"Take an umbrella.","category":"Worth Knowing"},
              {"id":"j2","title":"Flights to Tokyo","kind":"sketch","at":"2026-10-11T09:00:00Z"}]}""")
        val tasks = snapshot.tasks!!
        assertEquals(listOf("t1", "t2"), tasks.now.map { it.id })
        assertEquals(0.4f, tasks.now[0].fraction)
        assertEquals(listOf("Opened the airline", "Found 3 fares"), tasks.now[0].lines)
        assertNull(tasks.now[0].applet)
        assertEquals("mail", tasks.now[1].applet)
        assertEquals(1f, tasks.now[1].fraction, "progress stays within 0 to 1")
        val routine = tasks.routines.single()
        assertEquals(listOf("Daily news digest", "Tomorrow 7:00 AM", "Every day", "Fox"), listOf(routine.name, routine.`when`, routine.every, routine.by))
        assertNull(routine.fraction)
        val journal = snapshot.journal!!
        assertEquals(JournalEntry.Kind.Attention, journal[0].kind)
        assertEquals("Worth Knowing", journal[0].category)
        assertEquals(JournalEntry.Kind.Answer, journal[1].kind, "a kind from a newer computer reads as an answer")
        assertNull(journal[1].text)
    }

    @Test
    fun olderComputersSendNeither() {
        val snapshot = decode("""{"v":1,"at":"","now":[],"later":[],"accounts":[]}""")
        assertNull(snapshot.tasks)
        assertNull(snapshot.journal)
    }

    @Test
    fun aSlotThatDoesNotReadIsLeftOut() {
        val snapshot = decode("""{"v":1,"at":"","now":[],"later":[],"tasks":{"now":[{"name":"no id"}]},"journal":"soon",
            "applets":[{"key":"job-a1","title":"#spanish","section":"jobs"}]}""")
        assertNull(snapshot.tasks)
        assertNull(snapshot.journal)
        assertEquals("Things", snapshot.applets?.single()?.section?.title, "the rest still reads")
    }
}
