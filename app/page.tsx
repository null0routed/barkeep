"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, SaveIcon, UploadIcon, InfoIcon } from "lucide-react"
import Image from "next/image"
import CharacterSheet from "@/components/character-sheet"
import ChatInterface, { DEFAULT_MAX_MESSAGES } from "@/components/chat-interface"
import InstructionsModal from "@/components/instructions-modal"
import { useTheme } from "next-themes"
import type { CharacterData, ChatMessage, CampaignSummary, CampaignCheckpoint } from "@/lib/types"
import { defaultCharacter } from "@/lib/default-character"
import { toast } from "sonner"
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/default-prompts"
import { loadCheckpoints, saveCheckpoints, sanitizeCheckpoints } from "@/lib/campaign-checkpoints"
import PWAInstaller from "@/components/pwa-installer"

// Debounce window (ms) before pending changes are autosaved
const AUTOSAVE_DELAY_MS = 2500

export default function Home() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [character, setCharacter] = useState<CharacterData>(defaultCharacter)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [apiUrl, setApiUrl] = useState<string>("https://api.openai.com/v1/chat/completions")
  const [apiKey, setApiKey] = useState<string>("")
  const [model, setModel] = useState<string>("gpt-4o-mini")
  const [systemPrompt, setSystemPrompt] = useState<string>(DEFAULT_SYSTEM_PROMPT)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [maxMessages, setMaxMessages] = useState<number>(DEFAULT_MAX_MESSAGES)

  // Initialize the campaign summary (we'll keep this for compatibility)
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary>({
    conversationSummary: "",
    plotPoints: "",
    npcs: "",
    locations: "",
    quests: "",
    lastUpdated: "",
  })

  // Campaign status checkpoints written by the AI (persisted to localStorage by the tool itself)
  const [campaignCheckpoints, setCampaignCheckpoints] = useState<CampaignCheckpoint[]>([])

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
    const savedCampaignSummary = localStorage.getItem("dnd-campaign-summary")
    const savedMaxMessages = localStorage.getItem("dnd-max-messages")

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
    if (savedSystemPrompt) setSystemPrompt(savedSystemPrompt)
    if (savedCampaignSummary) {
      try {
        setCampaignSummary(JSON.parse(savedCampaignSummary))
      } catch (error) {
        console.error("Failed to parse saved campaign summary, using defaults:", error)
      }
    }
    if (savedMaxMessages) {
      const parsed = Number.parseInt(savedMaxMessages, 10)
      // A corrupt value (NaN) must not corrupt the message cap
      setMaxMessages(Number.isFinite(parsed) ? parsed : DEFAULT_MAX_MESSAGES)
    }
    setCampaignCheckpoints(loadCheckpoints())
    hasLoadedRef.current = true
  }, [])

  // Persist all app state to localStorage. Returns the checkpoint save result so the
  // caller can surface quota errors. Silent by itself (the manual save adds the toasts).
  const persistState = () => {
    localStorage.setItem("dnd-character", JSON.stringify(character))
    localStorage.setItem("dnd-chat", JSON.stringify(chatMessages))
    localStorage.setItem("dnd-api-url", apiUrl)
    localStorage.setItem("dnd-api-key", apiKey)
    localStorage.setItem("dnd-model", model)
    localStorage.setItem("dnd-system-prompt", systemPrompt)
    localStorage.setItem("dnd-campaign-summary", JSON.stringify(campaignSummary))
    localStorage.setItem("dnd-max-messages", maxMessages.toString())
    return saveCheckpoints(campaignCheckpoints)
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
  }, [character, chatMessages, apiUrl, apiKey, model, systemPrompt, campaignSummary, maxMessages])

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
    const checkpointResult = persistState()
    if (checkpointResult.ok) {
      toast.success("Saved to local storage!")
    } else {
      toast.error(`Saved, but campaign checkpoints could not be stored: ${checkpointResult.error}`)
    }
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
            if (data.character) setCharacter(data.character)
            if (data.chatMessages) setChatMessages(data.chatMessages)
            if (data.apiUrl) setApiUrl(data.apiUrl)
            if (data.apiKey) setApiKey(data.apiKey)
            if (data.model) setModel(data.model)
            if (data.systemPrompt) setSystemPrompt(data.systemPrompt)
            if (data.campaignSummary) setCampaignSummary(data.campaignSummary)
            if (data.maxMessages) setMaxMessages(data.maxMessages)
            // Files exported before checkpoints existed have no such key; leave current checkpoints alone then
            if (data.campaignCheckpoints !== undefined) setCampaignCheckpoints(sanitizeCheckpoints(data.campaignCheckpoints))
            toast.success("Loaded successfully!")
          } catch (error) {
            toast.error("Error loading file: Invalid format")
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  // Save data to file
  const saveToFile = () => {
    const data = {
      character,
      chatMessages,
      apiUrl,
      apiKey,
      model,
      systemPrompt,
      campaignSummary,
      maxMessages,
      campaignCheckpoints,
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
  }

  // If not mounted yet, don't render anything to avoid hydration mismatch
  if (!mounted) return null

  return (
    <main className="container mx-auto p-3 max-w-[1600px] h-screen flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Image src="/barkeep-logo.png" alt="Barkeep Logo" width={40} height={40} className="rounded-md" />
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
          <Button onClick={saveToFile} size="sm">
            Export
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
        <div className="lg:flex-1 overflow-y-auto min-w-0">
          <CharacterSheet
            character={character}
            setCharacter={setCharacter}
            chatMessages={chatMessages}
            apiUrl={apiUrl}
            apiKey={apiKey}
            model={model}
          />
        </div>
        <div className="lg:flex-1 min-w-0 flex flex-col">
          <ChatInterface
            messages={chatMessages}
            setMessages={setChatMessages}
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            model={model}
            setModel={setModel}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            campaignSummary={campaignSummary}
            setCampaignSummary={setCampaignSummary}
            campaignCheckpoints={campaignCheckpoints}
            setCampaignCheckpoints={setCampaignCheckpoints}
            maxMessages={maxMessages}
            setMaxMessages={setMaxMessages}
            character={character} // Pass character data to ChatInterface
          />
        </div>
      </div>

      <InstructionsModal open={instructionsOpen} onOpenChange={handleCloseInstructions} />
    </main>
  )
}
