"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ChatMessage, CampaignCheckpoint, CharacterData, CampaignNotes } from "@/lib/types"
import { SendIcon, SettingsIcon, TrashIcon, RefreshCwIcon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import MarkdownRenderer from "./markdown-renderer"
import { formatCharacterData } from "@/lib/format-character-data"
import { campaignCheckpointTools, runCheckpointTool, formatCheckpoint } from "@/lib/campaign-checkpoints"
import { resolveSystemPrompt } from "@/lib/system-prompt"
import { formatNotesForContext } from "@/lib/campaign-notes"
import {
  isAbortError,
  mergeUsage,
  toAssistantTurn,
  type AssistantTurn,
} from "@/lib/chat-turn"
import { toast } from "sonner"

interface ChatInterfaceProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  apiUrl: string
  setApiUrl: React.Dispatch<React.SetStateAction<string>>
  apiKey: string
  setApiKey: React.Dispatch<React.SetStateAction<string>>
  model: string
  setModel: React.Dispatch<React.SetStateAction<string>>
  // Player-authored CUSTOM system prompt only. "" means "use the built-in DM prompt" —
  // the resolution to the actual model-facing prompt happens in callApi (TODO #7), and
  // the built-in text itself is never rendered in the settings dialog.
  systemPrompt: string
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>
  // Player-authored campaign notes; shared with the AI only while notesInContext is opted in
  campaignNotes: CampaignNotes
  notesInContext: boolean
  campaignCheckpoints: CampaignCheckpoint[]
  setCampaignCheckpoints: React.Dispatch<React.SetStateAction<CampaignCheckpoint[]>>
  maxMessages: number
  setMaxMessages: React.Dispatch<React.SetStateAction<number>>
  character: CharacterData
}

// Default number of previous messages included in the model context (also the shared
// initial state in app/page.tsx — was inconsistently 6 here vs 10 there)
export const DEFAULT_MAX_MESSAGES = 10

// Static tool definition (module scope keeps its identity stable across renders —
// same pattern as campaignCheckpointTools in lib/campaign-checkpoints.ts)
const CHARACTER_SHEET_TOOL = {
  type: "function",
  function: {
    name: "getCharacterSheet",
    description: "Get the player's character sheet information",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
}

// Memoized message component to prevent re-rendering all messages when typing
const ChatMessageComponent = memo(
  ({
    message,
    onDelete,
    onRegenerate,
    isRegenerating,
  }: {
    message: ChatMessage
    onDelete: (id: string) => void
    onRegenerate?: (id: string) => void
    isRegenerating?: boolean
  }) => {
    const isUser = message.role === "user"

    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div className={`flex items-start gap-1 group ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          {/*
            Message action toolbar (TODO.MD #3.1): sits NEXT TO the bubble
            (user's right, assistant's left) and fades in on hover or keyboard
            focus — never overlaid on the message text. The space is always
            reserved (opacity only), so hover never reflows the list. On
            touch/small screens controls stay visible since hover doesn't exist.
          */}
          <div
            role="group"
            aria-label="Message actions"
            className="flex shrink-0 flex-col gap-1 pt-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onClick={() => onRegenerate(message.id)}
                disabled={isRegenerating}
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RefreshCwIcon className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-muted"
              onClick={() => onDelete(message.id)}
              title="Delete message"
              aria-label="Delete message"
            >
              <TrashIcon className="h-3 w-3" />
            </Button>
          </div>

          <div
            className={`max-w-[85%] max-w-3xl rounded-lg p-3 text-sm ${
              isUser ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            {isUser ? message.content : <MarkdownRenderer content={message.content} />}
          </div>
        </div>
      </div>
    )
  },
)

ChatMessageComponent.displayName = "ChatMessage"

// Memoized message list component
const MessageList = memo(
  ({
    messages,
    isLoading,
    messagesEndRef,
    onDeleteMessage,
    onRegenerateMessage,
    regeneratingId,
  }: {
    messages: ChatMessage[]
    isLoading: boolean
    messagesEndRef: React.RefObject<HTMLDivElement | null>
    onDeleteMessage: (id: string) => void
    onRegenerateMessage: (id: string) => void
    regeneratingId: string | null
  }) => {
    return (
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No messages yet. Start a conversation with your AI assistant!
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageComponent
              key={message.id}
              message={message}
              onDelete={onDeleteMessage}
              onRegenerate={message.role === "assistant" ? onRegenerateMessage : undefined}
              isRegenerating={regeneratingId === message.id}
            />
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] max-w-3xl rounded-lg p-3 bg-muted animate-pulse text-sm">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    )
  },
)

MessageList.displayName = "MessageList"

export default function ChatInterface({
  messages,
  setMessages,
  apiUrl,
  setApiUrl,
  apiKey,
  setApiKey,
  model,
  setModel,
  systemPrompt,
  setSystemPrompt,
  campaignNotes,
  notesInContext,
  campaignCheckpoints,
  setCampaignCheckpoints,
  maxMessages,
  setMaxMessages,
  character,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mirror of the checkpoint list so tool calls always see the latest value, even when several
  // tool calls run before React re-renders (a plain closure over the prop would be stale)
  const checkpointsRef = useRef<CampaignCheckpoint[]>(campaignCheckpoints)
  useEffect(() => {
    checkpointsRef.current = campaignCheckpoints
  }, [campaignCheckpoints])

  // Calculate and set the chat height based on window size
  const updateChatHeight = useCallback(() => {
    if (containerRef.current) {
      const windowHeight = window.innerHeight
      const containerRect = containerRef.current.getBoundingClientRect()
      const containerTop = containerRect.top
      const footerHeight = 56 // Height of the input area
      const headerHeight = 40 // Approximate height of the chat header
      const padding = 24 // Some padding

      const newHeight = windowHeight - containerTop - footerHeight - headerHeight - padding
      setChatHeight(Math.max(400, newHeight)) // Minimum height of 400px
    }
  }, [])

  // Update height on mount and window resize
  useEffect(() => {
    updateChatHeight()
    window.addEventListener("resize", updateChatHeight)
    return () => window.removeEventListener("resize", updateChatHeight)
  }, [updateChatHeight])

  const scrollToBottom = useCallback(() => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Function to handle tool calls (character sheet + campaign checkpoints)
  const handleToolCalls = useCallback(
    (toolCalls: any[]) => {
      const results = []
      let workingCheckpoints = checkpointsRef.current

      for (const toolCall of toolCalls) {
        const toolName: string = toolCall.function.name

        if (toolName === "getCharacterSheet") {
          // Format the character data
          const formattedCharacterData = formatCharacterData(character)
          results.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: "getCharacterSheet",
            content: formattedCharacterData,
          })
          continue
        }

        // Checkpoint tools: saves persist to localStorage inside runCheckpointTool
        const checkpointResult = runCheckpointTool(toolName, toolCall.function.arguments, workingCheckpoints)
        if (checkpointResult) {
          workingCheckpoints = checkpointResult.checkpoints
          results.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: checkpointResult.content,
          })
          continue
        }

        // Every tool call needs a matching result or the API rejects the follow-up request
        results.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolName,
          content: `Error: unknown tool "${toolName}".`,
        })
      }

      if (workingCheckpoints !== checkpointsRef.current) {
        checkpointsRef.current = workingCheckpoints
        setCampaignCheckpoints(workingCheckpoints)
      }

      return results
    },
    [character, setCampaignCheckpoints],
  )

  // Thin JSON POST helper shared by all legs of a turn
  const postJson = useCallback(
    async (body: unknown) => {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      return response.json()
    },
    [apiUrl, apiKey],
  )

  // Run one turn against the OpenAI-compatible endpoint and normalize it into an
  // AssistantTurn (content + optional model thinking + request stats — TODO.MD #3.4/#3.5).
  // `conversation` is the full ordered history for the turn; `onDelta` is invoked with
  // the accumulated content as it arrives (TODO.MD #3.6) — for non-streaming endpoints
  // it is invoked exactly once, with the final content, so callers treat both paths alike.
  const callApi = useCallback(
    async (conversation: ChatMessage[], onDelta?: (content: string) => void): Promise<AssistantTurn> => {
      try {
        const startedAt = Date.now()
        // Prepare the system message with the header summary and tool instructions
        const toolInstructions = `
You have access to the player's character sheet through a tool. You can access it by calling the getCharacterSheet function.
Use this tool when you need to reference the character's stats, abilities, inventory, or other details.
DO NOT mention that you're using this tool to the player - just incorporate the information naturally in your responses.

You also have two tools for long-term campaign memory, because older chat messages eventually drop out of your context:
- saveCampaignCheckpoint: call it at natural stopping points, such as the end of a scene, arrival at a new location, a major decision or revelation, a quest starting or finishing, or when the player says they are wrapping up. Record where the story stands and what you would need to pick it back up later. Do not save a checkpoint after every message.
- getCampaignCheckpoints: call it when a conversation begins or resumes with little prior context, when the player asks for a recap or says they are continuing, or when you are unsure about earlier events.
DO NOT mention these tools to the player - use them quietly and just continue the story.
`

        const systemMessage = {
          role: "system",
          // The custom prompt wins if set; otherwise the built-in DM prompt (TODO #7).
          content: `${resolveSystemPrompt(systemPrompt)}\n\n${
            notesInContext ? formatNotesForContext(campaignNotes) : ""
          }${
            campaignCheckpoints.length > 0
              ? `CAMPAIGN CONTEXT (from the latest saved checkpoint):\n${formatCheckpoint(campaignCheckpoints[campaignCheckpoints.length - 1])}\n\n`
              : ""
          }${toolInstructions}\nPlease keep this context in mind when responding.`,
        }

        // Prepare the messages for the API — `conversation` is the full ordered
        // history for this turn (the caller decides how far back it reaches)
        const apiMessages = [
          systemMessage,
          ...conversation.map((msg) => ({ role: msg.role, content: msg.content })),
        ]

        // Call the OpenAI-compatible API with tools
        const data = await postJson({
          model: model,
          messages: apiMessages,
          tools: [CHARACTER_SHEET_TOOL, ...campaignCheckpointTools],
          tool_choice: "auto",
          stream: false,
        })

        const firstMessage = data?.choices?.[0]?.message

        // Check if the response contains tool calls
        if (firstMessage?.tool_calls?.length > 0) {
          // Handle tool calls
          const toolResults = handleToolCalls(firstMessage.tool_calls)

          // Make a second API call with the tool results
          const secondData = await postJson({
            model: model,
            messages: [...apiMessages, firstMessage, ...toolResults],
            stream: false,
          })

          const turn = toAssistantTurn(
            secondData?.choices?.[0]?.message,
            mergeUsage(data?.usage, secondData?.usage),
            startedAt,
            conversation.length,
          )
          onDelta?.(turn.content)
          return turn
        }

        const turn = toAssistantTurn(firstMessage, data?.usage, startedAt, conversation.length)
        onDelta?.(turn.content)
        return turn
      } catch (error) {
        console.error("Error calling API:", error)
        throw error
      }
    },
    [postJson, model, systemPrompt, campaignNotes, notesInContext, campaignCheckpoints, handleToolCalls],
  )

  // Shared turn bookkeeping: creates the assistant bubble under a stable id up front
  // (so streaming deltas — TODO.MD #3.6 — and the final turn all land on the same
  // bubble), then settles it with the normalized turn content, thinking, and stats.
  // Pass an existing assistant bubble id (regenerate) to update it in place, or omit
  // the id (send/edit) to append a new bubble.
  const runAssistant = useCallback(
    async (conversation: ChatMessage[], bubbleId?: string) => {
      const id = bubbleId ?? crypto.randomUUID()

      const upsertContent = (content: string) => {
        setMessages((prev) => {
          const index = prev.findIndex((message) => message.id === id)
          if (index === -1) {
            return [...prev, { id, role: "assistant" as const, content }]
          }
          const next = [...prev]
          next[index] = { ...next[index], content }
          return next
        })
      }

      const turn = await callApi(conversation, upsertContent)

      setMessages((prev) => {
        const index = prev.findIndex((message) => message.id === id)
        const finalMessage: ChatMessage = {
          id,
          role: "assistant",
          content: turn.content,
          thinking: turn.thinking,
          stats: turn.stats,
        }
        if (index === -1) {
          return [...prev, finalMessage]
        }
        const next = [...prev]
        next[index] = finalMessage
        return next
      })
    },
    [callApi, setMessages],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim()) return

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
      setIsLoading(true)

      try {
        // Get the most recent messages, limited by maxMessages
        const recentMessages = messages.slice(-maxMessages)
        console.log(
          `Using ${recentMessages.length} recent messages out of ${messages.length} total (limit: ${maxMessages})`,
        )

        await runAssistant([...recentMessages, userMessage])
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error calling API:", error)
        // Ephemeral notification only — never persist error text into history, where it
        // would be replayed into model context on every subsequent request
        toast.error(
          "Sorry, there was an error processing your request. Please check your API settings and try again.",
        )
      } finally {
        setIsLoading(false)
        // Focus the input field after sending a message
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }
    },
    [input, messages, maxMessages, setMessages, runAssistant],
  )

  const handleDeleteMessage = useCallback(
    (id: string) => {
      setMessages((prev) => {
        // Find the index of the message to delete
        const index = prev.findIndex((msg) => msg.id === id)
        if (index === -1) return prev

        // Create a new array without the deleted message
        const newMessages = [...prev]
        newMessages.splice(index, 1)
        return newMessages
      })
    },
    [setMessages],
  )

  const handleRegenerateMessage = useCallback(
    async (id: string) => {
      // Find the assistant message to regenerate
      const assistantIndex = messages.findIndex((msg) => msg.id === id)
      if (assistantIndex === -1 || messages[assistantIndex].role !== "assistant") return

      // Find the user message that prompted this response
      let userIndex = assistantIndex - 1
      while (userIndex >= 0) {
        if (messages[userIndex].role === "user") break
        userIndex--
      }

      if (userIndex < 0) return // No user message found

      const userMessage = messages[userIndex]
      setRegeneratingId(id)

      try {
        // Get context messages (messages before the user message), then re-run the turn
        // and update the existing assistant bubble in place (same id → no remount)
        const conversation = [...messages.slice(0, userIndex), userMessage]
        await runAssistant(conversation, id)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error regenerating message:", error)
        toast.error("Sorry, the response could not be regenerated.")
      } finally {
        setRegeneratingId(null)
      }
    },
    [messages, runAssistant],
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
    setIsAlertOpen(false)
  }, [setMessages])

  // Memoized input change handler to prevent re-renders
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }, [])

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">AI Chat</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsAlertOpen(true)}
            disabled={messages.length === 0}
            title="Clear chat history"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Chat settings">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Chat Settings</DialogTitle>
                <DialogDescription>Configure your AI chat settings here.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="api-url">API URL</Label>
                  <Input
                    id="api-url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                  <p className="text-xs text-muted-foreground">
                    For local models, use something like: http://localhost:1234/v1/chat/completions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key (required for most services)"
                  />
                  <p className="text-xs text-muted-foreground">
                    An API key is required for OpenAI services. Some local servers may not require a key.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Model name (e.g., gpt-3.5-turbo, llama3, etc.)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Common models: gpt-3.5-turbo, gpt-4, llama-3-8b-instruct, mistral-7b-instruct, etc.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-messages">Max Previous Messages</Label>
                  <Input
                    id="max-messages"
                    type="number"
                    value={maxMessages}
                    onChange={(e) =>
                      setMaxMessages(Math.max(1, Number.parseInt(e.target.value) || DEFAULT_MAX_MESSAGES))
                    }
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of previous messages to include in the context (1-20).
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-system-prompt">Custom System Prompt</Label>
                <Textarea
                  id="custom-system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Optional. Leave blank to use the built-in D&D Dungeon Master prompt, or enter your own to replace it…"
                  rows={6}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Only your own text lives here. When left blank the built-in Dungeon Master prompt is used
                  automatically and is never shown or pre-filled in this box.
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Done</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="flex flex-col w-full" style={{ height: `${chatHeight}px` }}>
        <CardContent
          className="flex-1 overflow-y-auto p-4"
          style={{ height: `calc(${chatHeight}px - 56px)` }}
          ref={chatContentRef}
        >
          <MessageList
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
            onDeleteMessage={handleDeleteMessage}
            onRegenerateMessage={handleRegenerateMessage}
            regeneratingId={regeneratingId}
          />
        </CardContent>
        <CardFooter className="border-t p-3 h-[56px]">
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Type your message..."
              disabled={isLoading || regeneratingId !== null}
              className="flex-1 text-sm"
            />
            <Button type="submit" disabled={isLoading || regeneratingId !== null || !input.trim()} size="sm">
              <SendIcon className="h-4 w-4 mr-1" /> Send
            </Button>
          </form>
        </CardFooter>
      </Card>

      {/* Confirmation dialog for clearing chat */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all chat messages? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearChat}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
