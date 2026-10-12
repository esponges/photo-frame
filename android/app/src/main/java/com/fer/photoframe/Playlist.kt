package com.fer.photoframe

import kotlin.random.Random

/** What [Playlist] persists; [Prefs] implements it, tests use an in-memory fake. */
interface PlaylistStore {
    var items: List<Item>
    var queue: List<String>
    var cursor: Int
}

/**
 * Shuffle with a no-repeat window: the queue is a permutation of the whole library,
 * walked start to finish before reshuffling, so nothing repeats until almost
 * everything has been seen. Pure random would feel repetitive at a few hundred items.
 *
 * Newly added photos are spliced into the *remainder* of the current cycle rather
 * than appended, so an upload shows up within minutes instead of waiting a full pass.
 */
class Playlist(
    private val prefs: PlaylistStore,
    private val random: Random = Random.Default,
) {

    private var items: List<Item> = emptyList()
    private var queue: MutableList<String> = mutableListOf()
    private var cursor = 0

    val size: Int get() = items.size

    fun restore() {
        items = prefs.items
        queue = prefs.queue.toMutableList()
        cursor = prefs.cursor
        // Drop ids that no longer exist, e.g. hidden or deleted while powered off.
        val known = items.map { it.id }.toSet()
        queue.retainAll(known)
        if (queue.isEmpty() && items.isNotEmpty()) reshuffle()
        cursor = cursor.coerceIn(0, maxOf(0, queue.size - 1))
    }

    /** Returns true when the visible set changed and the UI should advance. */
    fun update(newItems: List<Item>): Boolean {
        val oldIds = items.map { it.id }.toSet()
        val newIds = newItems.map { it.id }.toSet()
        items = newItems
        prefs.items = newItems

        if (newItems.isEmpty()) {
            queue.clear()
            persist()
            return true
        }

        val removed = queue.removeAll { it !in newIds }
        val added = newIds - oldIds

        if (queue.isEmpty()) {
            reshuffle()
            return true
        }

        if (added.isNotEmpty()) {
            // Scatter the new ids randomly through the not-yet-played tail.
            val tailStart = (cursor + 1).coerceAtMost(queue.size)
            val tail = queue.subList(tailStart, queue.size)
            val merged = (tail + added).shuffled(random)
            tail.clear()
            tail.addAll(merged)
        }

        if (cursor >= queue.size) cursor = 0
        persist()
        return removed || added.isNotEmpty()
    }

    private fun reshuffle() {
        queue = items.map { it.id }.shuffled(random).toMutableList()
        cursor = 0
        persist()
    }

    fun current(): Item? = queue.getOrNull(cursor)?.let { id -> items.find { it.id == id } }

    fun advance(): Item? {
        if (queue.isEmpty()) {
            if (items.isEmpty()) return null
            reshuffle()
        } else {
            cursor++
            if (cursor >= queue.size) reshuffle() else persist()
        }
        return current()
    }

    /** The item after the current one, for prefetching exactly one ahead. */
    fun peekNext(): Item? {
        if (queue.isEmpty()) return null
        val next = queue.getOrNull(cursor + 1) ?: queue.firstOrNull()
        return items.find { it.id == next }
    }

    private fun persist() {
        prefs.queue = queue
        prefs.cursor = cursor
    }
}
