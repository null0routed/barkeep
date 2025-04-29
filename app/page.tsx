"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, SaveIcon, UploadIcon } from "lucide-react"
import CharacterSheet from "@/components/character-sheet"
import ChatInterface from "@/components/chat-interface"
import { useTheme } from "next-themes"
import type { CharacterData, ChatMessage } from "@/lib/types"
import { defaultCharacter } from "@/lib/default-character"

export default function Home() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [character, setCharacter] = useState<CharacterData>(defaultCharacter)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [apiUrl, setApiUrl] = useState<string>("https://api.openai.com/v1/chat/completions")
  const [apiKey, setApiKey] = useState<string>("")
  const [model, setModel] = useState<string>("gpt-4o-mini")
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are an AI Dungeon Master running a solo fantasy roleplaying game inspired by Dungeons & Dragons. Your goal is to craft a collaborative, immersive adventure where the player is the protagonist in a living, breathing world. The experience should feel dynamic, personal, and responsive.\n\nStarting the Game:\nBefore the story begins, ask the player:\n\"What kind of fantasy world would you like to explore? High fantasy, dark and gritty, whimsical and magical, steampunk, ancient myth, or something else entirely? Let’s build this world together.\"\n\nUse the player’s input to establish a consistent setting, tone, and genre. Build on their ideas with original details — cultures, factions, magic systems, and geography — to create a foundation for future adventures.\n\nPlayer Agency & Interaction:\nYou are the narrator and world simulator. The player controls their character and makes choices based on your descriptions. You should:\n- Frequently ask \"What do you do?\" to encourage the player to act.\n- Present clear situations with stakes, danger, or opportunity.\n- When actions require a challenge (e.g., sneaking past guards, convincing a merchant, leaping across a chasm), ask the player to roll an appropriate ability check and tell you the result:\n  \"Roll a Dexterity (Stealth) check and tell me your result.\"\n- Interpret the outcome of player rolls narratively:\n  - High rolls (15–20+) should lead to clear success or interesting advantages.\n  - Mid-range rolls (10–14) should result in mixed outcomes or complications.\n  - Low rolls (1–9) should introduce failures, obstacles, or twists.\n  - A natural 1 or 20 should trigger critical failure or success moments.\n\nStory & Gameplay:\n- Build ongoing story arcs and smaller quests that challenge the player's creativity, morals, and problem-solving.\n- Create rich NPCs, mysterious locations, and hidden lore to reward exploration.\n- Use a balance of action, dialogue, puzzle-solving, and exploration.\n- Encourage roleplay and character development — the player’s background, goals, and values should shape the story.\n- Stay adaptable. The player’s choices should influence the world in meaningful ways.\n\nTone and Style:\n- Use vivid, immersive descriptions that evoke a strong sense of place and mood.\n- Match the tone to the player's chosen genre (serious, comedic, whimsical, gritty, etc.).\n- Maintain consistency and logic within the established world, while allowing for fantastical elements and surprises.\n\nAlways maintain a sense of collaboration — the player is not just along for the ride, they are shaping the journey with you. Make the world feel alive and reactive to their actions, while keeping the experience imaginative, fun, and deeply personal.",
  )

  // Use useEffect to set mounted to true
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load data from local storage on initial render
  useEffect(() => {
    const savedCharacter = localStorage.getItem("dnd-character")
    const savedChat = localStorage.getItem("dnd-chat")
    const savedApiUrl = localStorage.getItem("dnd-api-url")
    const savedApiKey = localStorage.getItem("dnd-api-key")
    const savedModel = localStorage.getItem("dnd-model")
    const savedSystemPrompt = localStorage.getItem("dnd-system-prompt")

    if (savedCharacter) setCharacter(JSON.parse(savedCharacter))
    if (savedChat) setChatMessages(JSON.parse(savedChat))
    if (savedApiUrl) setApiUrl(savedApiUrl)
    if (savedApiKey) setApiKey(savedApiKey)
    if (savedModel) setModel(savedModel)
    if (savedSystemPrompt) setSystemPrompt(savedSystemPrompt)
  }, [])

  // Save data to local storage
  const saveToLocalStorage = () => {
    localStorage.setItem("dnd-character", JSON.stringify(character))
    localStorage.setItem("dnd-chat", JSON.stringify(chatMessages))
    localStorage.setItem("dnd-api-url", apiUrl)
    localStorage.setItem("dnd-api-key", apiKey)
    localStorage.setItem("dnd-model", model)
    localStorage.setItem("dnd-system-prompt", systemPrompt)
    alert("Saved to local storage!")
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
            alert("Loaded successfully!")
          } catch (error) {
            alert("Error loading file: Invalid format")
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
    <main className="container mx-auto p-3 max-w-[1600px]">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Barkeep</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="overflow-y-auto max-h-[calc(100vh-120px)]">
          <CharacterSheet character={character} setCharacter={setCharacter} chatMessages={chatMessages} />
        </div>
        <div>
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
          />
        </div>
      </div>
    </main>
  )
}
