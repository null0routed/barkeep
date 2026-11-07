"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { MoreHorizontalIcon, AlertTriangleIcon, SunIcon, MoonIcon } from "lucide-react"
import Image from "next/image"
import CharacterSheet from "@/components/character-sheet"
import ChatInterface, { DEFAULT_MAX_MESSAGES, MAX_PREVIOUS_MESSAGES } from "@/components/chat-interface"
import InstructionsModal from "@/components/instructions-modal"
import AboutModal from "@/components/about-modal"
import ExportDialog from "@/components/export-dialog"
import { useTheme } from "next-themes"
import type { CharacterData, ChatMessage, CampaignCheckpoint, CampaignNotes } from "@/lib/types"
import { defaultCharacter } from "@/lib/default-character"
import { toast } from "sonner"
import { migrateStoredSystemPrompt } from "@/lib/system-prompt"
import { DEFAULT_IMAGE_RATE, DEFAULT_IMAGE_SIZE, clampImageRate } from "@/lib/image-gen"
import { deleteImage } from "@/lib/image-store"
import { LOOT_STORAGE_KEY, mergeLoot, sanitizeStoredLoot } from "@/lib/loot"
import type { LootEntry } from "@/lib/loot"
import { loadCheckpoints, sanitizeCheckpoints, CHECKPOINTS_STORAGE_KEY, MAX_CHECKPOINTS_STORED } from "@/lib/campaign-checkpoints"
import {
  DEFAULT_COMPACTION_SETTINGS,
  sanitizeCompactionSettings,
  COMPACTION_SETTINGS_KEY,
  CONVERSATION_SUMMARY_KEY,
  SUMMARY_COVERS_KEY,
  type CompactionSettings,
} from "@/lib/compaction"
import {
  NOTES_STORAGE_KEY,
  NOTES_CONTEXT_KEY,
  emptyCampaignNotes,
  sanitizeCampaignNotes,
} from "@/lib/campaign-notes"
import {
  APP_STORAGE_KEYS,
  STORAGE_SAFE_WATERMARK_BYTES,
  STORAGE_TRIGGER_BYTES,
  formatBytes,
  measureStoredBytes,
  planChatTrim,
  serializedBytes,
} from "@/lib/storage-budget"

/** Result of one persistState() call (used by the manual-save toast) */
interface SaveResult {
  ok: boolean
  error?: string
  totalBytes: number
}
import PWAInstaller from "@/components/pwa-installer"

// Debounce window (ms) before pending changes are autosaved
const AUTOSAVE_DELAY_MS = 2500
// Draggable panel-split clamp range (percent) so neither panel can collapse
const MIN_PANEL_SPLIT = 25
const MAX_PANEL_SPLIT = 75

export default function Home() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [character, setCharacter] = useState<CharacterData>(defaultCharacter)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  // T3.2: read-through mirror of chatMessages (same pattern as chat-interface's
  // checkpointsRef). `getChatMessages` keeps a STABLE identity across re-renders —
  // including the per-frame streaming re-renders of this component — while always
  // returning the current history. CharacterSheet (memoized) can therefore skip
  // re-rendering entirely while a turn streams; the dialogs read the accessor at
  // render/effect time so they always see the latest messages.
  const chatMessagesRef = useRef(chatMessages)
  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])
  const getChatMessages = useCallback(() => chatMessagesRef.current, [])
  const [apiUrl, setApiUrl] = useState<string>("https://api.openai.com/v1/chat/completions")
  const [apiKey, setApiKey] = useState<string>("")
  const [model, setModel] = useState<string>("gpt-4o-mini")
  // Custom (player-authored) system prompt only — "" means "use the built-in DM prompt",
  // which is resolved at request time (chat-interface) and never rendered in settings.
  const [systemPrompt, setSystemPrompt] = useState<string>("")
  // Image generation (TODO #9) — all optional; blank api-url = feature off.
  const [imageApiUrl, setImageApiUrl] = useState<string>("")
  // Dedicated key for the image endpoint (optional); blank = reuse the chat API key.
  const [imageApiKey, setImageApiKey] = useState<string>("")
  const [imageModel, setImageModel] = useState<string>("")
  const [imageRate, setImageRate] = useState<number>(DEFAULT_IMAGE_RATE)
  const [imageSize, setImageSize] = useState<string>(DEFAULT_IMAGE_SIZE)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // Per-export API key decision (dialog) — see components/export-dialog.tsx
  const [exportOpen, setExportOpen] = useState(false)
  // T4.3: the "More" header dropdown (Save now / Load from file… / Show instructions /
  // theme toggle). Everything in it is TEXT — the icon ambiguity that made Save (disk)
  // and Load (upload) look swappable is gone. Export lives OUTSIDE the menu, per the
  // locked decision: it is the labeled data-safety CTA and must stay always visible.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [moreMenuOpen])
  const [maxMessages, setMaxMessages] = useState<number>(DEFAULT_MAX_MESSAGES)

  // Context compaction (OpenCode-style rolling summary): the settings, the summary
  // itself, and how many of the OLDEST chat messages it already covers (the compacted
  // prefix — chat-interface sends everything after it as the raw tail).
  const [compactionSettings, setCompactionSettings] = useState<CompactionSettings>(DEFAULT_COMPACTION_SETTINGS)
  const [conversationSummary, setConversationSummary] = useState<string | null>(null)
  const [summaryCoversCount, setSummaryCoversCount] = useState<number>(0)

  // Resizable split between the two panels (desktop only). panelRatio is the left
  // panel's share in percent; persisted under dnd-panel-ratio like the other dnd-* keys.
  const [panelRatio, setPanelRatio] = useState(50)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  // Loaded in an effect (not a useState initializer) so nothing touches localStorage
  // during the server render. Declared before the mounted effect below, so the first
  // visible paint already carries the saved split.
  useEffect(() => {
    const saved = Number.parseFloat(localStorage.getItem("dnd-panel-ratio") ?? "")
    if (Number.isFinite(saved) && saved >= MIN_PANEL_SPLIT && saved <= MAX_PANEL_SPLIT) {
      setPanelRatio(saved)
    }
  }, [])

  const persistSplit = (ratio: number) => {
    localStorage.setItem("dnd-panel-ratio", String(ratio))
  }

  const startDividerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = splitContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    document.body.style.userSelect = "none"
    const clamp = (pct: number) => Math.min(MAX_PANEL_SPLIT, Math.max(MIN_PANEL_SPLIT, Math.round(pct)))
    const onMove = (ev: PointerEvent) => {
      const ratio = clamp(((ev.clientX - rect.left) / rect.width) * 100)
      setPanelRatio(ratio)
      persistSplit(ratio)
    }
    const onUp = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = ""
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    onMove(e.nativeEvent)
  }

  const resetDividerSplit = () => {
    setPanelRatio(50)
    persistSplit(50)
  }

  // Player-authored campaign notes (private to the player; shared with the AI only when
  // notesInContext is opted in) + the persistence of that opt-in flag
  const [campaignNotes, setCampaignNotes] = useState<CampaignNotes>(emptyCampaignNotes())
  const [notesInContext, setNotesInContext] = useState(false)

  // Campaign status checkpoints written by the AI (persisted to localStorage by the tool itself)
  const [campaignCheckpoints, setCampaignCheckpoints] = useState<CampaignCheckpoint[]>([])

  // Captured loot finds (TODO #8, T8.1): the DM's "barkeep-loot" captures, kept
  // newest-first, capped at 25. Persisted under LOOT_STORAGE_KEY (budget-covered via
  // APP_STORAGE_KEYS); EXCLUDED from export files — derivable from the chat history
  // (the capture effect re-captures from imported history, so the store self-heals).
  const [loot, setLoot] = useState<LootEntry[]>([])

  // Merge new captures into the capped store (chat-interface delivers batches).
  // Idempotent — mergeLoot dedupes — so double delivery (StrictMode, re-capture of
  // edited messages) can never duplicate an entry.
  const handleLootCapture = useCallback((incoming: LootEntry[]) => {
    if (incoming.length === 0) return
    setLoot((prev) => mergeLoot(prev, incoming))
  }, [])

  // Measured current storage usage in quota bytes (TODO #1): drives the warning banner
  // from the 3.2 MB waterline up; updated after every persist and on initial load.
  const [storageBytes, setStorageBytes] = useState<number>(0)

  // Use useEffect to set mounted to true and check if first visit
  useEffect(() => {
    setMounted(true)

    // Check if this is the first visit
    const hasVisitedBefore = localStorage.getItem("barkeep-visited")
    if (!hasVisitedBefore) {
      setInstructionsOpen(true)
    }
  }, [])

  // Handle closing the instructions modal
  const handleCloseInstructions = () => {
    setInstructionsOpen(false)
    localStorage.setItem("barkeep-visited", "true")
  }

  // Flips to true once the load effect has run; lets autosave skip its initial pass
  const hasLoadedRef = useRef(false)

  // Load data from local storage on initial render.
  // Every JSON.parse is guarded individually so one corrupt value cannot abort the
  // whole load — same pattern as loadCheckpoints() in lib/campaign-checkpoints.ts.
  useEffect(() => {
    const savedCharacter = localStorage.getItem("dnd-character")
    const savedChat = localStorage.getItem("dnd-chat")
    const savedApiUrl = localStorage.getItem("dnd-api-url")
    const savedApiKey = localStorage.getItem("dnd-api-key")
    const savedModel = localStorage.getItem("dnd-model")
    const savedSystemPrompt = localStorage.getItem("dnd-system-prompt")
    const savedMaxMessages = localStorage.getItem("dnd-max-messages")
    const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY)
    const savedNotesContext = localStorage.getItem(NOTES_CONTEXT_KEY)
    const savedLoot = localStorage.getItem(LOOT_STORAGE_KEY)
    const savedImageApiUrl = localStorage.getItem("dnd-image-api-url")
    const savedImageApiKey = localStorage.getItem("dnd-image-api-key")
    const savedImageModel = localStorage.getItem("dnd-image-model")
    const savedImageRate = localStorage.getItem("dnd-image-rate")
    const savedImageSize = localStorage.getItem("dnd-image-size")
    const savedCompactionSettings = localStorage.getItem(COMPACTION_SETTINGS_KEY)
    const savedConversationSummary = localStorage.getItem(CONVERSATION_SUMMARY_KEY)
    const savedSummaryCovers = localStorage.getItem(SUMMARY_COVERS_KEY)

    if (savedCharacter) {
      try {
        setCharacter(JSON.parse(savedCharacter))
      } catch (error) {
        console.error("Failed to parse saved character, using defaults:", error)
      }
    }
    if (savedChat) {
      try {
        setChatMessages(JSON.parse(savedChat))
      } catch (error) {
        console.error("Failed to parse saved chat history, starting fresh:", error)
      }
    }
    if (savedApiUrl) setApiUrl(savedApiUrl)
    if (savedApiKey) setApiKey(savedApiKey)
    if (savedModel) setModel(savedModel)
    // Image generation settings (TODO #9) — the rate is clamped; blank values leave defaults.
    if (savedImageApiUrl !== null) setImageApiUrl(savedImageApiUrl)
    if (savedImageApiKey !== null) setImageApiKey(savedImageApiKey)
    if (savedImageModel !== null) setImageModel(savedImageModel)
    if (savedImageRate !== null) setImageRate(clampImageRate(Number.parseFloat(savedImageRate)))
    if (savedImageSize !== null) setImageSize(savedImageSize)
    // Migration: a byte-for-byte copy of the built-in default (auto-stored by older
    // versions) resets to "" so it no longer renders in the settings dialog; a genuine
    // customization carries through untouched (see lib/system-prompt.ts).
    setSystemPrompt(migrateStoredSystemPrompt(savedSystemPrompt))
    if (savedMaxMessages) {
      const parsed = Number.parseInt(savedMaxMessages, 10)
      // A corrupt value (NaN) must not corrupt the message cap; clamp to the legacy window
      setMaxMessages(Number.isFinite(parsed) ? Math.min(MAX_PREVIOUS_MESSAGES, Math.max(1, parsed)) : DEFAULT_MAX_MESSAGES)
    }
    if (savedNotes) {
      try {
        const parsedNotes = sanitizeCampaignNotes(JSON.parse(savedNotes))
        if (parsedNotes) setCampaignNotes(parsedNotes)
      } catch (error) {
        console.error("Failed to parse saved campaign notes, using defaults:", error)
      }
    }
    if (savedNotesContext === "1") setNotesInContext(true)
    if (savedLoot) {
      try {
        setLoot(sanitizeStoredLoot(JSON.parse(savedLoot)))
      } catch (error) {
        console.error("Failed to parse saved loot captures, starting fresh:", error)
      }
    }
    setCampaignCheckpoints(loadCheckpoints())
    // Context compaction state (rolling summary + coverage boundary). Corrupt or absent
    // values fall back to the defaults — a summary without a valid boundary is unusable,
    // so both are restored together or not at all.
    if (savedCompactionSettings) {
      try {
        setCompactionSettings(sanitizeCompactionSettings(JSON.parse(savedCompactionSettings)))
      } catch (error) {
        console.error("Failed to parse compaction settings, using defaults:", error)
      }
    }
    const savedCovers = Number.parseInt(savedSummaryCovers ?? "", 10)
    if (savedConversationSummary && Number.isFinite(savedCovers)) {
      setConversationSummary(savedConversationSummary)
      setSummaryCoversCount(Math.max(0, savedCovers))
    }
    // Baseline measurement for the storage banner (reads current on-disk values)
    setStorageBytes(measureStoredBytes(APP_STORAGE_KEYS))
    hasLoadedRef.current = true
  }, [])

  /**
   * Persist all app state to localStorage — quota-safe (TODO #1, locked spec):
   *  1. trim target #2 first: cap the checkpoint store at MAX_CHECKPOINTS_STORED (oldest)
   *  2. trim target #1 second: if the projected total crosses the 4 MB trigger, drop
   *     OLDEST chat messages first, trimming down to under the 3.2 MB safe line
   *  3. write everything inside one try/catch — a quota failure surfaces loudly with
   *     export guidance instead of an unhandled throw in the autosave timer (spec S5)
   *  4. publish the measured usage for the storage banner
   * In-memory state is always preserved; only persistence can be denied.
   */
  const persistState = (): SaveResult => {
    // Serialize once up front: the same strings feed both the budget math and the writes
    const characterJson = JSON.stringify(character)
    const notesJson = JSON.stringify(campaignNotes)
    const maxMessagesValue = maxMessages.toString()
    const notesContextValue = notesInContext ? "1" : "0"
    const lootJson = JSON.stringify(loot)

    // Trim target #2: checkpoint store cap (oldest pruned)
    const checkpointDrop = Math.max(0, campaignCheckpoints.length - MAX_CHECKPOINTS_STORED)
    const checkpoints = checkpointDrop > 0 ? campaignCheckpoints.slice(checkpointDrop) : campaignCheckpoints
    const checkpointsJson = JSON.stringify(checkpoints)

    const baseBytes =
      serializedBytes(characterJson) +
      serializedBytes(notesJson) +
      serializedBytes(checkpointsJson) +
      serializedBytes(apiUrl) +
      serializedBytes(apiKey) +
      serializedBytes(model) +
      serializedBytes(imageApiUrl) +
      serializedBytes(imageApiKey) +
      serializedBytes(imageModel) +
      serializedBytes(imageRate.toString()) +
      serializedBytes(imageSize) +
      serializedBytes(systemPrompt) +
      serializedBytes(maxMessagesValue) +
      serializedBytes(notesContextValue) +
      serializedBytes(lootJson) +
      serializedBytes(JSON.stringify(compactionSettings)) +
      serializedBytes(conversationSummary ?? "") +
      serializedBytes(summaryCoversCount.toString())

    // Trim target #1: oldest chat first — only when the projected total crosses the trigger
    let chat = chatMessages
    let chatDrop = 0
    const fullChatJson = JSON.stringify(chat)
    if (baseBytes + serializedBytes(fullChatJson) > STORAGE_TRIGGER_BYTES && chat.length > 0) {
      chatDrop = planChatTrim({ baseBytes, messageBytes: chat.map((m) => serializedBytes(JSON.stringify(m))) })
      // Content guard: with a rolling summary in place, prune ONLY inside the covered
      // prefix — anything beyond it was never summarized, and dropping it would lose
      // story content (the existing warning + export advice covers the rest).
      if (conversationSummary) chatDrop = Math.min(chatDrop, summaryCoversCount)
      if (chatDrop > 0) chat = chatMessages.slice(chatDrop)
    }
    const chatJson = chat === chatMessages ? fullChatJson : JSON.stringify(chat)

    if (chatDrop > 0 || checkpointDrop > 0) {
      if (chatDrop > 0) {
        setChatMessages(chat)
        // Free the IndexedDB blobs behind the pruned messages (TODO.MD #9.2) so dropped
        // scene images don't linger as orphans. deleteImage is fire-and-forget, never throws.
        for (const dropped of chatMessages.slice(0, chatDrop)) {
          if (dropped.image?.id) void deleteImage(dropped.image.id)
        }
        // The pruned messages sit inside the summary's covered prefix — shift the
        // boundary back by exactly what fell out (the summary already carries them).
        if (conversationSummary) setSummaryCoversCount((prev) => Math.max(0, prev - chatDrop))
      }
      if (checkpointDrop > 0) setCampaignCheckpoints(checkpoints)
      const parts: string[] = []
      if (chatDrop > 0) parts.push(`${chatDrop.toLocaleString()} oldest chat messages`)
      if (checkpointDrop > 0) parts.push(`${checkpointDrop.toLocaleString()} oldest checkpoints`)
      toast.warning(`Storage is near its limit — pruned ${parts.join(" and ")} to keep saving. Export to preserve them.`)
    }

    const totalBytes = baseBytes + serializedBytes(chatJson)

    try {
      localStorage.setItem("dnd-character", characterJson)
      localStorage.setItem("dnd-chat", chatJson)
      localStorage.setItem("dnd-api-url", apiUrl)
      localStorage.setItem("dnd-api-key", apiKey)
      localStorage.setItem("dnd-model", model)
      localStorage.setItem("dnd-image-api-url", imageApiUrl)
      localStorage.setItem("dnd-image-api-key", imageApiKey)
      localStorage.setItem("dnd-image-model", imageModel)
      localStorage.setItem("dnd-image-rate", imageRate.toString())
      localStorage.setItem("dnd-image-size", imageSize)
      localStorage.setItem("dnd-system-prompt", systemPrompt)
      localStorage.setItem("dnd-max-messages", maxMessagesValue)
      localStorage.setItem(NOTES_STORAGE_KEY, notesJson)
      localStorage.setItem(NOTES_CONTEXT_KEY, notesContextValue)
      localStorage.setItem(CHECKPOINTS_STORAGE_KEY, checkpointsJson)
      localStorage.setItem(LOOT_STORAGE_KEY, lootJson)
      localStorage.setItem(COMPACTION_SETTINGS_KEY, JSON.stringify(compactionSettings))
      localStorage.setItem(CONVERSATION_SUMMARY_KEY, conversationSummary ?? "")
      localStorage.setItem(SUMMARY_COVERS_KEY, summaryCoversCount.toString())
      setStorageBytes(totalBytes)
      return { ok: true, totalBytes }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown storage error"
      toast.error(
        `Could not save to local storage (${message}). Export your save file and remove some old chat messages, then try again.`,
      )
      return { ok: false, error: message, totalBytes }
    }
  }

  // Mirror persistState in a ref so the autosave effect never needs the (unstable)
  // function itself in its deps — same mirror pattern as checkpointsRef in chat-interface.
  const persistStateRef = useRef(persistState)
  useEffect(() => {
    persistStateRef.current = persistState
  })
  // True while a change is still inside the debounced window (drives the unload guards)
  const savePendingRef = useRef(false)
  // Armed on the first pass after load, so the initial render never marks itself pending
  const autosaveArmedRef = useRef(false)

  // Autosave: persist ~2.5s after the last change, so a closed tab can't lose more than
  // a couple of seconds of work (checkpoints already auto-save; the rest did not).
  useEffect(() => {
    if (!hasLoadedRef.current) return
    if (!autosaveArmedRef.current) {
      autosaveArmedRef.current = true
      return
    }
    savePendingRef.current = true
    const timer = setTimeout(() => {
      savePendingRef.current = false
      persistStateRef.current()
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [character, chatMessages, apiUrl, apiKey, model, imageApiUrl, imageApiKey, imageModel, imageRate, imageSize, systemPrompt, maxMessages, campaignNotes, notesInContext, loot, compactionSettings, conversationSummary, summaryCoversCount])

  // If the tab hides while a save is pending, flush it immediately — the page is still
  // alive here, so this is reliable (a save inside a beforeunload handler is not).
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && savePendingRef.current) {
        savePendingRef.current = false
        persistStateRef.current()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [])

  // Last-resort native warning if the user is about to leave with unsaved changes
  // still inside the debounced window.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savePendingRef.current) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  // Manual save: persist and surface the result (autosave stays silent)
  const saveToLocalStorage = () => {
    savePendingRef.current = false
    const result = persistState()
    if (result.ok) {
      toast.success("Saved to local storage!")
    }
    // A failed persist already toasted inside persistState — the single loud point for
    // every caller (autosave and manual save share the same path).
  }

  // Load data from file
  const loadFromFile = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string)

            // The import must respect the storage budget (TODO #1) — plan trims on the
            // INCOMING payload, oldest chat first, before applying anything.
            const importedChatArray = Array.isArray(data.chatMessages) ? (data.chatMessages as ChatMessage[]) : null
            const importedCheckpoints =
              data.campaignCheckpoints !== undefined ? sanitizeCheckpoints(data.campaignCheckpoints) : campaignCheckpoints
            const importedNotes =
              data.campaignNotes !== undefined ? sanitizeCampaignNotes(data.campaignNotes) : campaignNotes

            // Compaction state (rolling summary + coverage boundary). The summary is only
            // valid against the chat IT summarized, so on an import it replaces the local
            // state — applied together with its boundary, clamped to the imported chat, and
            // cleared when the file has none (a summary over a different conversation would
            // be worse than none). Settings are independent and apply when present.
            const importedSummary =
              typeof data.conversationSummary === "string" && data.conversationSummary.trim().length > 0
                ? data.conversationSummary
                : null
            const importedCoversRaw = Number(data.summaryCoversCount)
            const importedCovers =
              Number.isFinite(importedCoversRaw) && importedCoversRaw >= 0 ? Math.floor(importedCoversRaw) : 0
            const chatLengthAfterImport = importedChatArray ? (importedChatArray as ChatMessage[]).length : chatMessages.length
            let coversApplied =
              importedSummary !== null ? Math.min(importedCovers, chatLengthAfterImport) : 0
            if (data.compactionSettings !== undefined) {
              setCompactionSettings(sanitizeCompactionSettings(data.compactionSettings))
            }
            if (importedSummary !== null) {
              setConversationSummary(importedSummary)
              setSummaryCoversCount(coversApplied)
            } else if (importedChatArray !== null) {
              setConversationSummary(null)
              setSummaryCoversCount(0)
            }

            const importBaseBytes =
              serializedBytes(JSON.stringify(data.character ?? character)) +
              serializedBytes(JSON.stringify(importedNotes)) +
              serializedBytes(JSON.stringify(importedCheckpoints)) +
              serializedBytes(String(data.apiUrl ?? apiUrl)) +
              serializedBytes(String(data.apiKey ?? apiKey)) +
              serializedBytes(String(data.model ?? model)) +
              serializedBytes(String(data.imageApiUrl ?? imageApiUrl)) +
              serializedBytes(String(data.imageApiKey ?? imageApiKey)) +
              serializedBytes(String(data.imageModel ?? imageModel)) +
              serializedBytes(String(data.imageRate ?? imageRate)) +
              serializedBytes(String(data.imageSize ?? imageSize)) +
              serializedBytes(String(data.systemPrompt ?? systemPrompt)) +
              serializedBytes(String(data.maxMessages ?? maxMessages)) +
              serializedBytes(String(data.notesInContext ?? notesInContext)) +
              (importedSummary !== null
                ? serializedBytes(JSON.stringify(sanitizeCompactionSettings(data.compactionSettings))) +
                  serializedBytes(importedSummary) +
                  serializedBytes(String(coversApplied))
                : 0)

            let chatToApply = importedChatArray
            if (
              importedChatArray &&
              importBaseBytes + serializedBytes(JSON.stringify(importedChatArray)) > STORAGE_TRIGGER_BYTES &&
              importedChatArray.length > 0
            ) {
              let drop = planChatTrim({
                baseBytes: importBaseBytes,
                messageBytes: importedChatArray.map((m) => serializedBytes(JSON.stringify(m))),
              })
              // Content guard: with an imported summary in place, prune ONLY inside its
              // covered prefix — the tail beyond it was never summarized, and dropping it
              // would silently lose story content.
              if (importedSummary !== null) drop = Math.min(drop, coversApplied)
              if (drop > 0) {
                chatToApply = importedChatArray.slice(drop)
                // The pruned head sits inside the summary's covered prefix — shift the
                // boundary back by exactly what fell out (the summary already carries them).
                coversApplied = Math.max(0, coversApplied - drop)
                // Free any IndexedDB blobs for the dropped (un-imported) messages — usually a
                // no-op (their images came from the source device) but keeps IDB consistent on
                // a same-device export→import round trip.
                for (const dropped of importedChatArray.slice(0, drop)) {
                  if (dropped.image?.id) void deleteImage(dropped.image.id)
                }
                toast.warning(
                  `Import exceeded the storage budget — the ${drop.toLocaleString()} oldest chat messages were not imported. Export them from the source device if you need them.`,
                )
              }
            }

            if (data.character) setCharacter(data.character)
            if (importedChatArray) setChatMessages(chatToApply as ChatMessage[])
            if (data.apiUrl) setApiUrl(data.apiUrl)
            if (data.apiKey) setApiKey(data.apiKey)
            if (data.model) setModel(data.model)
            // Image settings (TODO #9): apply when present in the file (even blank, so
            // a saved device's off-state carries); absent older exports leave current values alone.
            if (data.imageApiUrl !== undefined) setImageApiUrl(String(data.imageApiUrl))
            if (data.imageApiKey !== undefined) setImageApiKey(String(data.imageApiKey))
            if (data.imageModel !== undefined) setImageModel(String(data.imageModel))
            if (data.imageRate !== undefined) setImageRate(clampImageRate(Number(data.imageRate)))
            if (data.imageSize !== undefined) setImageSize(String(data.imageSize))
            // Same migration as the localStorage load: old export files may carry an
            // untouched copy of the built-in prompt.
            if (data.systemPrompt !== undefined) setSystemPrompt(migrateStoredSystemPrompt(data.systemPrompt))
            if (data.maxMessages) setMaxMessages(Math.min(MAX_PREVIOUS_MESSAGES, Math.max(1, Number(data.maxMessages) || DEFAULT_MAX_MESSAGES)))
            // Files exported before checkpoints existed have no such key; leave current checkpoints alone then.
            // sanitizeCheckpoints enforces the 50-checkpoint store cap on imported lists.
            if (data.campaignCheckpoints !== undefined) setCampaignCheckpoints(importedCheckpoints)
            // Player notes + the share-with-AI opt-in (files without these keys leave the current values alone).
            // sanitizeCampaignNotes enforces the 16K total notes cap on imported lists.
            if (data.campaignNotes !== undefined && importedNotes) setCampaignNotes(importedNotes)
            if (typeof data.notesInContext === "boolean") setNotesInContext(data.notesInContext)
            // Refresh the banner after the import settles
            setStorageBytes(measureStoredBytes(APP_STORAGE_KEYS))
            toast.success("Loaded successfully!")
            // A shared save should never silently change another device's AI connection
            if (data.apiKey) toast.warning("This file contained an API key — it has been applied to this device.")
          } catch (error) {
            toast.error("Error loading file: Invalid format")
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  // Save data to file. includeApiKey is the player's per-export choice (ExportDialog):
  // the key is omitted entirely, and import's `if (data.apiKey)` guard then leaves the
  // destination device's existing key untouched.
  const saveToFile = (includeApiKey: boolean) => {
    const data = {
      character,
      chatMessages,
      apiUrl,
      ...(includeApiKey ? { apiKey, imageApiKey } : {}),
      model,
      imageApiUrl,
      imageModel,
      imageRate,
      imageSize,
      systemPrompt,
      maxMessages,
      compactionSettings,
      conversationSummary,
      summaryCoversCount,
      campaignCheckpoints,
      campaignNotes,
      notesInContext,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${character.name || "character"}-sheet.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(includeApiKey ? "Save file exported (with API key)" : "Save file exported (without API key)")
  }

  const handleExport = () => {
    // No key set → nothing to protect and no meaningful choice: export directly.
    // Key set → per-export decision in ExportDialog.
    if (apiKey.trim()) setExportOpen(true)
    else saveToFile(false)
  }

  // If not mounted yet, don't render anything to avoid hydration mismatch
  if (!mounted) return null

  return (
    <main className="container mx-auto p-3 max-w-[2200px] flex flex-col lg:h-screen">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {/* App icon (mug), not the 1.98 MB portrait logo — the badge renders at 40px,
              so the 35.8 KB 192px variant is 4.8x supersampled and 1/8 the download. */}
          {/* App icon (mug), not the 1.98 MB portrait logo — the badge renders at 48px,
              so the 35.8 KB 192px variant is 4x supersampled and 1/8 the download.
              The mug badge's brown square is inset 0.25px from the canvas and its corner
              radius is 31/192 of the canvas (7.75px at 48px). The stroke below is an SVG
              path drawn on that exact geometry (ring/outline follow the CSS box, which
              is NOT the badge, leaving a cream sliver at the seam) — so it hugs the
              badge with no background bleed. */}
          <span className="relative inline-block rounded-[8.75px] dark:shadow-[0_0_12px_0_hsl(var(--ring)/0.35)]">
            <Image src="/android-chrome-192x192.png" alt="Barkeep logo" width={48} height={48} />
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-12 w-12 overflow-visible"
              viewBox="0 0 48 48"
            >
              <rect
                x="0.25"
                y="0.25"
                width="47.5"
                height="47.5"
                rx="7.75"
                fill="none"
                strokeWidth="2"
                style={{ stroke: "hsl(var(--ring))" }}
              />
            </svg>
          </span>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold leading-tight">Barkeep</h1>
            {/* The copyright lives with the brand (titlebar-style) instead of as an
                orphan line under the panels — which also used to sit over the chat
                input. Hidden below sm, where the header stays icon-compact (it's still
                in the About dialog on phones). Cinzel + all caps to match the h1. */}
            <span className="hidden text-xs leading-tight text-muted-foreground font-display uppercase tracking-[0.08em] sm:inline">
              © {new Date().getFullYear()} Barkeep.cloudkern.com
            </span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <PWAInstaller />
          {/* T4.3: consolidated "More" menu (hand-rolled, no new dep — matches the
              lightbox precedent). Closes on outside-click and Esc. */}
          <div className="relative" ref={moreMenuRef}>
            <Button
              variant="outline"
              size="icon"
              aria-haspopup="true"
              aria-expanded={moreMenuOpen}
              aria-label="More actions"
              title="More actions"
              onClick={() => setMoreMenuOpen((open) => !open)}
            >
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
            {moreMenuOpen && (
              <div
                role="menu"
                aria-label="More actions"
                className="absolute top-full right-0 z-40 mt-2 w-56 rounded-md border bg-popover p-1 shadow-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    saveToLocalStorage()
                  }}
                >
                  Save now
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    loadFromFile()
                  }}
                >
                  Load from file…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    setInstructionsOpen(true)
                  }}
                >
                  Show instructions
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    setAboutOpen(true)
                  }}
                >
                  About
                </button>
                <a
                  href="https://github.com/null0routed/barkeep"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMoreMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {/* lucide-react dropped its brand icons in this version, so the GitHub
                      mark is inlined (simplified, fill=currentColor so it follows the
                      hover tint). */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  GitHub
                </a>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setMoreMenuOpen(false)
                    setTheme(theme === "dark" ? "light" : "dark")
                  }}
                >
                  {/* The icon shows the TARGET theme (Sun → Light mode, Moon → Dark
                      mode), which also resolves the old icon-ambiguity that motivated
                      the text-only menu (T4.3). */}
                  {theme === "dark" ? (
                    <SunIcon className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <MoonIcon className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
              </div>
            )}
          </div>
          {/* Locked decision: Export stays outside the menu — the labeled data-safety CTA. */}
          <Button size="sm" onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>

      {/* Storage budget warning (TODO #1): visible from the 3.2 MB waterline upward */}
      {storageBytes >= STORAGE_SAFE_WATERMARK_BYTES && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <span className="text-amber-700 dark:text-amber-400">
            Storage at <span className="font-semibold">{formatBytes(storageBytes)}</span> of the{" "}
            {formatBytes(STORAGE_TRIGGER_BYTES)} budget — oldest chat history will be pruned first if more space is
            needed.
          </span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleExport}>
            Export save
          </Button>
        </div>
      )}

      {/*
        T4.1: below lg the two panels stack (chat first) and the PAGE scrolls —
        main is content-height and this container flows normally. At lg+ the app
        becomes a fixed viewport (lg:h-screen on main) with both panels scrolling
        INTERNALLY, which is what needs flex-1 + overflow-hidden here.
      */}
      <div
        ref={splitContainerRef}
        className="flex flex-col lg:flex-row gap-4 lg:flex-1 lg:overflow-hidden"
        style={{ "--split": `${panelRatio}%` } as React.CSSProperties}
      >
        <div className="overflow-y-auto min-w-0 order-2 lg:order-1 lg:[flex:1_1_var(--split)]">
          <CharacterSheet
            character={character}
            setCharacter={setCharacter}
            getChatMessages={getChatMessages} // stable accessor (T3.2) — see the ref mirror above
            loot={loot} // "Generate Details" seeding (TODO #8, T8.2)
            systemPrompt={systemPrompt} // "" = built-in DM prompt; the campaign's game system
            apiUrl={apiUrl}
            apiKey={apiKey}
            model={model}
            campaignNotes={campaignNotes}
            setCampaignNotes={setCampaignNotes}
            notesInContext={notesInContext}
            setNotesInContext={setNotesInContext}
          />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize. Double-click to reset 50/50"
          className="hidden lg:flex lg:order-2 self-stretch w-1.5 cursor-col-resize touch-none items-center justify-center rounded-full bg-border transition-colors hover:bg-muted-foreground/40"
          onPointerDown={startDividerDrag}
          onDoubleClick={resetDividerSplit}
        >
          <div className="h-10 w-0.5 rounded-full bg-muted-foreground/40" />
        </div>
        <div className="min-w-0 flex flex-col order-first lg:order-3 lg:[flex:1_1_calc(100%-var(--split))]">
          <ChatInterface
            messages={chatMessages}
            setMessages={setChatMessages}
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            imageApiUrl={imageApiUrl}
            setImageApiUrl={setImageApiUrl}
            imageApiKey={imageApiKey}
            setImageApiKey={setImageApiKey}
            imageModel={imageModel}
            setImageModel={setImageModel}
            imageRate={imageRate}
            setImageRate={setImageRate}
            imageSize={imageSize}
            setImageSize={setImageSize}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            campaignNotes={campaignNotes}
            notesInContext={notesInContext}
            campaignCheckpoints={campaignCheckpoints}
            setCampaignCheckpoints={setCampaignCheckpoints}
            maxMessages={maxMessages}
            setMaxMessages={setMaxMessages}
            compactionSettings={compactionSettings}
            setCompactionSettings={setCompactionSettings}
            conversationSummary={conversationSummary}
            setConversationSummary={setConversationSummary}
            summaryCoversCount={summaryCoversCount}
            setSummaryCoversCount={setSummaryCoversCount}
            onLootCapture={handleLootCapture}
            character={character} // Pass character data to ChatInterface
          />
        </div>
      </div>

      <InstructionsModal open={instructionsOpen} onOpenChange={handleCloseInstructions} />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={(includeKey) => {
          setExportOpen(false)
          saveToFile(includeKey)
        }}
      />
    </main>
  )
}
