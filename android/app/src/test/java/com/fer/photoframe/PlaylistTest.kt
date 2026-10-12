package com.fer.photoframe

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeStore : PlaylistStore {
    override var items: List<Item> = emptyList()
    override var queue: List<String> = emptyList()
    override var cursor: Int = 0
}

private fun item(id: String) = Item(id, "md5-$id", "photo", 100, 200, "", null)
private fun items(n: Int) = (1..n).map { item("p$it") }

class PlaylistTest {
    private val store = FakeStore()
    private fun playlist(seed: Int = 1) = Playlist(store, Random(seed))

    /** Ids shown over one full pass: the current item, then `size - 1` advances. */
    private fun fullPass(p: Playlist): List<String> =
        listOf(p.current()!!.id) + (1 until p.size).map { p.advance()!!.id }

    @Test
    fun emptyPlaylistHasNothingToShow() {
        val p = playlist().also { it.restore() }
        assertNull(p.current())
        assertNull(p.advance())
        assertNull(p.peekNext())
    }

    @Test
    fun onePassShowsEveryItemExactlyOnce() {
        val p = playlist()
        p.update(items(20))
        val pass = fullPass(p)
        assertEquals(20, pass.size)
        assertEquals(20, pass.toSet().size)
    }

    @Test
    fun noRepeatUntilTheCycleIsExhausted() {
        val p = playlist()
        p.update(items(10))
        val first = fullPass(p)
        // The 11th advance wraps and reshuffles: the next pass is again a full permutation.
        val second = (1..10).map { p.advance()!!.id }
        assertEquals(first.toSet(), second.toSet())
        assertEquals(10, second.toSet().size)
    }

    @Test
    fun wrappingIntoANewCycleNeverRepeatsTheLastItem() {
        for (n in 2..4) for (seed in 1..50) {
            val p = playlist(seed)
            p.update(items(n))
            var previous = p.current()!!.id
            repeat(n * 6) {
                val next = p.advance()!!.id
                assertTrue("n=$n seed=$seed repeated $next", next != previous)
                previous = next
            }
        }
    }

    @Test
    fun singleItemKeepsShowingItself() {
        val p = playlist()
        p.update(items(1))
        assertEquals("p1", p.current()?.id)
        assertEquals("p1", p.advance()?.id)
        assertEquals("p1", p.peekNext()?.id)
    }

    @Test
    fun peekNextMatchesWhatAdvanceReturns() {
        val p = playlist()
        p.update(items(8))
        repeat(7) {
            val peeked = p.peekNext()?.id
            assertEquals(peeked, p.advance()?.id)
        }
    }

    @Test
    fun newItemsAreSplicedIntoTheRemainderNotTheHistory() {
        val p = playlist()
        p.update(items(10))
        val played = (1..4).map { p.advance()!!.id } + p.current()!!.id // cursor now at 4
        val playedSoFar = store.queue.take(store.cursor + 1)

        assertTrue(p.update(items(10) + item("new1") + item("new2")))

        // Already-played prefix is untouched and the new ids land after the cursor.
        assertEquals(playedSoFar, store.queue.take(store.cursor + 1))
        val tail = store.queue.drop(store.cursor + 1)
        assertTrue("new1" in tail && "new2" in tail)
        assertEquals(12, store.queue.size)
        assertEquals(12, store.queue.toSet().size)
        assertNotNull(played)
    }

    @Test
    fun removedItemsLeaveTheQueueAndTheCurrentItemStaysValid() {
        val p = playlist()
        p.update(items(10))
        repeat(3) { p.advance() }
        val remaining = items(10).filter { it.id !in setOf("p1", "p2", "p3", "p4", "p5") }

        assertTrue(p.update(remaining))

        assertEquals(remaining.map { it.id }.toSet(), store.queue.toSet())
        assertNotNull(p.current())
        assertTrue(p.current()!!.id in remaining.map { it.id })
    }

    @Test
    fun unchangedSetReportsNoChange() {
        val p = playlist()
        p.update(items(5))
        assertFalse(p.update(items(5)))
    }

    @Test
    fun clearingTheLibraryEmptiesThePlaylist() {
        val p = playlist()
        p.update(items(5))
        assertTrue(p.update(emptyList()))
        assertNull(p.current())
        assertEquals(0, p.size)
    }

    @Test
    fun restoreResumesTheSavedPosition() {
        val a = playlist()
        a.update(items(12))
        repeat(5) { a.advance() }
        val expectedCurrent = a.current()!!.id
        val expectedNext = a.peekNext()!!.id

        // A fresh Playlist over the same store, as after a reboot.
        val b = playlist(seed = 99).also { it.restore() }

        assertEquals(expectedCurrent, b.current()?.id)
        assertEquals(expectedNext, b.peekNext()?.id)
    }

    @Test
    fun restoreDropsItemsThatVanishedWhilePoweredOff() {
        val a = playlist()
        a.update(items(6))
        // Simulate the manifest cache no longer containing two ids.
        val keep = items(6).filter { it.id !in setOf("p2", "p5") }
        store.items = keep

        val b = playlist().also { it.restore() }

        assertEquals(keep.map { it.id }.toSet(), store.queue.toSet().intersect(keep.map { it.id }.toSet()))
        assertTrue(fullPass(b).all { id -> keep.any { it.id == id } })
    }

    @Test
    fun restoreWithCorruptCursorIsClamped() {
        playlist().also { it.update(items(4)) }
        store.cursor = 999

        val p = playlist().also { it.restore() }

        assertNotNull(p.current())
    }
}
