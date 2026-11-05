"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, SaveIcon, UploadIcon, InfoIcon, AlertTriangleIcon } from "lucide-react"
import Image from "next/image"
import CharacterSheet from "@/components/character-sheet"
import ChatInterface, { DEFAULT_MAX_MESSAGES } from "@/components/chat-interface"
import InstructionsModal from "@/components/instructions-modal"
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
  // Per-export API key decision (dialog) — see components/export-dialog.tsx
  const [exportOpen, setExportOpen] = useState(false)
  const [maxMessages, setMaxMessages] = useState<number>(DEFAULT_MAX_MESSAGES)

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
      // A corrupt value (NaN) must not corrupt the message cap
      setMaxMessages(Number.isFinite(parsed) ? parsed : DEFAULT_MAX_MESSAGES)
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
      serializedBytes(lootJson)

    // Trim target #1: oldest chat first — only when the projected total crosses the trigger
    let chat = chatMessages
    let chatDrop = 0
    const fullChatJson = JSON.stringify(chat)
    if (baseBytes + serializedBytes(fullChatJson) > STORAGE_TRIGGER_BYTES && chat.length > 0) {
      chatDrop = planChatTrim({ baseBytes, messageBytes: chat.map((m) => serializedBytes(JSON.stringify(m))) })
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
  }, [character, chatMessages, apiUrl, apiKey, model, imageApiUrl, imageApiKey, imageModel, imageRate, imageSize, systemPrompt, maxMessages, campaignNotes, notesInContext, loot])

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
              serializedBytes(String(data.notesInContext ?? notesInContext))

            let chatToApply = importedChatArray
            if (
              importedChatArray &&
              importBaseBytes + serializedBytes(JSON.stringify(importedChatArray)) > STORAGE_TRIGGER_BYTES &&
              importedChatArray.length > 0
            ) {
              const drop = planChatTrim({
                baseBytes: importBaseBytes,
                messageBytes: importedChatArray.map((m) => serializedBytes(JSON.stringify(m))),
              })
              if (drop > 0) {
                chatToApply = importedChatArray.slice(drop)
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
            if (data.maxMessages) setMaxMessages(data.maxMessages)
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
    <main className="container mx-auto p-3 max-w-[2200px] h-screen flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          {/* App icon (mug), not the 1.98 MB portrait logo — the badge renders at 40px,
              so the 35.8 KB 192px variant is 4.8x supersampled and 1/8 the download. */}
          <Image src="/android-chrome-192x192.png" alt="Barkeep logo" width={40} height={40} className="rounded-md" />
          <h1 className="text-2xl font-bold">Barkeep</h1>
        </div>
        <div className="flex gap-2">
          <PWAInstaller />
          <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => setInstructionsOpen(true)}>
            <InfoIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={saveToLocalStorage}>
            <SaveIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={loadFromFile}>
            <UploadIcon className="h-4 w-4" />
          </Button>
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

      <div
        ref={splitContainerRef}
        className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden"
        style={{ "--split": `${panelRatio}%` } as React.CSSProperties}
      >
        <div className="overflow-y-auto min-w-0 lg:[flex:1_1_var(--split)]">
          <CharacterSheet
            character={character}
            setCharacter={setCharacter}
            chatMessages={chatMessages}
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
          className="hidden lg:flex self-stretch w-1.5 cursor-col-resize touch-none items-center justify-center rounded-full bg-border transition-colors hover:bg-muted-foreground/40"
          onPointerDown={startDividerDrag}
          onDoubleClick={resetDividerSplit}
        >
          <div className="h-10 w-0.5 rounded-full bg-muted-foreground/40" />
        </div>
        <div className="min-w-0 flex flex-col lg:[flex:1_1_calc(100%-var(--split))]">
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
            onLootCapture={handleLootCapture}
            character={character} // Pass character data to ChatInterface
          />
        </div>
      </div>

      <InstructionsModal open={instructionsOpen} onOpenChange={handleCloseInstructions} />
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
