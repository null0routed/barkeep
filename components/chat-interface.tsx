"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ChatMessage, CampaignCheckpoint, CharacterData, CampaignNotes } from "@/lib/types"
import { InfoIcon, PencilIcon, SendIcon, SettingsIcon, SquareIcon, TrashIcon, RefreshCwIcon } from "lucide-react"
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
import { buildSystemMessageBase } from "@/lib/system-prompt"
import { collectLoot } from "@/lib/loot"
import type { LootEntry } from "@/lib/loot"
import { formatNotesForContext } from "@/lib/campaign-notes"
import {
  buildStats,
  extractThinking,
  isAbortError,
  mergeUsage,
  statsLines,
  type ApiUsage,
  type AssistantTurn,
} from "@/lib/chat-turn"
import {
  accumulateToolCalls,
  finalizeToolCalls,
  iterateStream,
  type ToolCallAcc,
} from "@/lib/stream"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  /** Merge loot finds captured out of assistant messages into the page-level store (TODO #8, T8.1). */
  onLootCapture?: (entries: LootEntry[]) => void
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
    onEdit,
    isEditing,
    editDraft,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
    inFlight,
  }: {
    message: ChatMessage
    onDelete: (id: string) => void
    onRegenerate?: (id: string) => void
    isRegenerating?: boolean
    // TODO.MD #3.2 (edit)
    onEdit?: (id: string) => void
    isEditing?: boolean
    editDraft?: string
    onEditDraftChange?: (value: string) => void
    onSaveEdit?: (id: string) => void
    onCancelEdit?: () => void
    // True while any turn is running or a message is in inline edit
    inFlight?: boolean
  }) => {
    const isUser = message.role === "user"

    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`flex items-start gap-1 group ${
            isUser ? "flex-row-reverse" : "flex-row"
          }${isUser && isEditing ? " w-full" : ""}`}
        >
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
            {/* TODO.MD #3.2: edit + resend, on user bubbles only */}
            {/* TODO.MD #3.4: per-turn stats (tokens in/out, context, speed, duration) */}
            {!isUser && message.stats && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-muted"
                    title="Turn statistics"
                    aria-label="Turn statistics"
                  >
                    <InfoIcon className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="grid grid-cols-[max-content_max-content] gap-x-3 gap-y-0.5">
                    {statsLines(message.stats).map((line) => (
                      <span key={line.label} className="contents">
                        <span className="pr-1 opacity-60">{line.label}</span>
                        <span className="whitespace-nowrap">{line.value}</span>
                      </span>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {isUser && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onClick={() => onEdit(message.id)}
                disabled={inFlight}
                title="Edit and resend chat"
                aria-label="Edit message"
              >
                <PencilIcon className="h-3 w-3" />
              </Button>
            )}
            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onClick={() => onRegenerate(message.id)}
                disabled={isRegenerating || inFlight}
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RefreshCwIcon className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(message.id)}
              title="Delete message"
              aria-label="Delete message"
            >
              <TrashIcon className="h-3 w-3" />
            </Button>
          </div>

          <div
            className={`max-w-[85%] max-w-3xl rounded-lg p-3 text-sm ${
              isUser
                ? isEditing
                  ? // T5-E6: in edit mode the bubble is a full-width editor
                  // (w-full on this div AND its row above) — without an explicit
                  // width it sizes to content (the textarea's ~20ch intrinsic
                  // width), which reads as a slim ~200px box.
                  "w-full bg-background"
                  : "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
          >
            {isUser && isEditing ? (
              // TODO.MD #3.2: edit the message, then Save re-submits the whole chat
              <div className="w-full space-y-2">
                <Textarea
                  value={editDraft}
                  onChange={(e) => onEditDraftChange?.(e.target.value)}
                  rows={Math.max(2, Math.min(8, (editDraft ?? "").split("\n").length))}
                  className="min-h-[48px] resize-y text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => onSaveEdit?.(message.id)}
                    disabled={!editDraft || !editDraft.trim()}
                  >
                    Save &amp; resend
                  </Button>
                </div>
              </div>
            ) : isUser ? (
              message.content
            ) : (
              <MarkdownRenderer content={message.content} thinking={message.thinking} />
            )}
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
    onEdit,
    editingId,
    editDraft,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
    inFlight,
  }: {
    messages: ChatMessage[]
    isLoading: boolean
    messagesEndRef: React.RefObject<HTMLDivElement | null>
    onDeleteMessage: (id: string) => void
    onRegenerateMessage: (id: string) => void
    regeneratingId: string | null
    onEdit: (id: string) => void
    editingId: string | null
    editDraft: string
    onEditDraftChange: (value: string) => void
    onSaveEdit: (id: string) => void
    onCancelEdit: () => void
    inFlight: boolean
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
              onEdit={message.role === "user" ? onEdit : undefined}
              isEditing={editingId === message.id}
              editDraft={editDraft}
              onEditDraftChange={onEditDraftChange}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              inFlight={inFlight}
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
  onLootCapture,
  character,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  // TODO.MD #3.2: the user message currently in inline edit, and its draft text
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Loot capture (TODO #8, T8.1): pull barkeep-loot fences out of assistant messages
  // and hand them to the page-level store (state lives in app/page.tsx). Processing
  // is keyed on id + content length so a fence that arrives incomplete mid-stream is
  // re-parsed as the message grows; mergeLoot dedupes any double delivery
  // (StrictMode, edited messages). On first load / import the same effect
  // re-captures from existing history — the store self-heals, no migration needed.
  const lootSeenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!onLootCapture) return
    for (const message of messages) {
      if (message.role !== "assistant" || !message.content) continue
      const key = message.id + "@" + message.content.length
      if (lootSeenRef.current.has(key)) continue
      lootSeenRef.current.add(key)
      const found = collectLoot(message.content)
      if (found.length > 0) onLootCapture(found)
    }
  }, [messages, onLootCapture])

  // TODO.MD #3.3: one AbortController per in-flight turn; created by the turn handlers
  // before the request, and read by the leg fetches as their `signal`.
  const abortRef = useRef<AbortController | null>(null)

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

  // Run one turn against the OpenAI-compatible endpoint and normalize it into an
  // AssistantTurn (content + optional model thinking + request stats — TODO.MD #3.4/#3.5).
  // `conversation` is the full ordered history for the turn; `onDelta` is invoked with the
  // accumulated content each time more of it arrives.
  //
  // Streaming (TODO.MD #3.6): each leg is requested with `stream: true`. If the endpoint
  // answers with a `text/event-stream` body the SSE chunks are read (content streamed to
  // onDelta as it lands, thinking/usage accumulated, tool-call fragments assembled); if it
  // ignores `stream` and returns a single JSON document instead, that is read as the
  // fall-back body. Both paths converge on the same per-leg result, so the two-leg tool
  // flow below is identical either way.
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
          // The custom prompt wins if set, otherwise the built-in DM prompt (TODO #7),
          // plus the loot-capture section appended to BOTH (TODO #8 — owner decision).
          content: `${buildSystemMessageBase(systemPrompt)}\n\n${
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

        // One leg of the turn: POST (trying `stream: true`) and accumulate its answer —
        // text content (streamed to onDelta as it lands), thinking, usage, and any tool
        // calls — from an SSE body (preferred) or, as the fallback, a single JSON document.
        const runLeg = async (payload: Record<string, unknown>) => {
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            // TODO.MD #3.3: lets the Stop button cancel this leg mid-stream
            signal: abortRef.current?.signal,
          })

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`)
          }

          const contentType = response.headers.get("content-type") ?? ""
          const isSse = contentType.includes("text/event-stream")

          let content = ""
          let thinking = ""
          let usage: ApiUsage | undefined
          const toolAcc = new Map<number, ToolCallAcc>()

          // Fold provider thinking (whatever field it arrives in) into the running total.
          const takeThinking = (value: unknown): void => {
            const found = extractThinking(value)
            if (found) thinking += found
          }

          if (isSse && response.body) {
            for await (const chunk of iterateStream(response.body)) {
              if (typeof chunk !== "object" || chunk === null) continue
              const c = chunk as Record<string, unknown>
              if (c.usage && typeof c.usage === "object") {
                usage = mergeUsage(usage, c.usage as ApiUsage)
              }
              const choices = Array.isArray(c.choices) ? c.choices : []
              const first = choices[0]
              const delta =
                first && typeof first.delta === "object" && first.delta !== null
                  ? (first.delta as Record<string, unknown>)
                  : undefined
              if (!delta) continue
              if (typeof delta.content === "string") {
                content += delta.content
                onDelta?.(content)
              }
              takeThinking(delta)
              if (delta.tool_calls) {
                accumulateToolCalls(toolAcc, delta.tool_calls)
              }
            }
          } else {
            // Fall-back: the endpoint ignored `stream: true` and returned one JSON document.
            const data = (await response.json()) as Record<string, unknown>
            if (data.usage && typeof data.usage === "object") {
              usage = mergeUsage(usage, data.usage as ApiUsage)
            }
            const choices = Array.isArray(data.choices) ? data.choices : []
            const msg =
              choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : undefined
            const message =
              msg && typeof msg.message === "object" && msg.message !== null
                ? (msg.message as Record<string, unknown>)
                : undefined
            if (message) {
              if (typeof message.content === "string") content = message.content
              takeThinking(message)
              if (Array.isArray(message.tool_calls)) {
                ;(message.tool_calls as unknown[]).forEach((raw, index) => {
                  const call = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
                  const fn =
                    call.function && typeof call.function === "object"
                      ? (call.function as Record<string, unknown>)
                      : {}
                  toolAcc.set(index, {
                    id: typeof call.id === "string" ? call.id : "",
                    name: typeof fn.name === "string" ? fn.name : "",
                    arguments: typeof fn.arguments === "string" ? fn.arguments : "",
                  })
                })
              }
            }
            // Surface the already-complete content as a single delta so callers are uniform.
            if (content) onDelta?.(content)
          }

          return {
            content,
            thinking: thinking.trim() ? thinking : undefined,
            usage,
            toolCalls: finalizeToolCalls(toolAcc),
          }
        }

        // Leg one — the tool-enabled request. If it produced tool calls, run the follow-up
        // leg with the results; otherwise the first leg is the final answer.
        const leg1 = await runLeg({
          model: model,
          messages: apiMessages,
          tools: [CHARACTER_SHEET_TOOL, ...campaignCheckpointTools],
          tool_choice: "auto",
          stream: true,
          stream_options: { include_usage: true },
        })

        if (leg1.toolCalls.length > 0) {
          const toolResults = handleToolCalls(leg1.toolCalls)
          const firstMessage = {
            role: "assistant",
            content: leg1.content || null,
            tool_calls: leg1.toolCalls,
          }
          const leg2 = await runLeg({
            model: model,
            messages: [...apiMessages, firstMessage, ...toolResults],
            stream: true,
            stream_options: { include_usage: true },
          })
          return {
            content: leg2.content,
            thinking: leg2.thinking,
            stats: buildStats(mergeUsage(leg1.usage, leg2.usage), startedAt, conversation.length),
          }
        }

        return {
          content: leg1.content,
          thinking: leg1.thinking,
          stats: buildStats(leg1.usage, startedAt, conversation.length),
        }
      } catch (error) {
        console.error("Error calling API:", error)
        throw error
      }
    },
    [model, apiKey, apiUrl, systemPrompt, campaignNotes, notesInContext, campaignCheckpoints, handleToolCalls],
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

        abortRef.current = new AbortController()
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
        abortRef.current = new AbortController()
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

  // TODO.MD #3.3: abort the in-flight turn. Whatever content already rendered stays;
  // the abort surfaces as a neutral "Stopped." toast in the caller's catch.
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // True while any turn is running OR a message is in inline edit — gates the
  // per-bubble actions and the composer so turns and edits never interleave.
  const inFlight = isLoading || regeneratingId !== null || editingId !== null

  // TODO.MD #3.2 (edit): begin inline editing of a user message
  const startEdit = useCallback(
    (id: string) => {
      const target = messages.find((msg) => msg.id === id)
      if (!target || target.role !== "user") return
      setEditingId(id)
      setEditDraft(target.content)
    },
    [messages],
  )

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft("")
  }, [])

  // TODO.MD #3.2 (edit): apply the draft in place, then re-submit the WHOLE chat —
  // the edited message stays in its position, the tail is preserved (PLAN.MD
  // decision #2) — and append the new assistant reply at the end.
  const saveEdit = useCallback(
    async (id: string) => {
      if (!editDraft.trim()) return
      const updated = messages.map((msg) => (msg.id === id ? { ...msg, content: editDraft } : msg))
      setMessages(updated)
      setEditingId(null)
      setEditDraft("")
      setIsLoading(true)

      try {
        abortRef.current = new AbortController()
        await runAssistant(updated)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error re-submitting chat after edit:", error)
        toast.error("Sorry, the edited chat could not be re-run.")
      } finally {
        setIsLoading(false)
      }
    },
    [messages, editDraft, runAssistant, setMessages],
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
    // Radix Tooltip requires a provider ancestor; scoping it here keeps the bubble
    // actions self-contained (settings, alerts, and dialogs do not need it)
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col h-full" ref={containerRef}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">AI Chat</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsAlertOpen(true)}
            disabled={messages.length === 0}
            className="hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
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
            onEdit={startEdit}
            editingId={editingId}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            inFlight={inFlight}
          />
        </CardContent>
        <CardFooter className="border-t p-3 h-[56px]">
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              placeholder="Type your message..."
              disabled={inFlight}
              className="flex-1 text-sm"
            />
            {isLoading || regeneratingId !== null ? (
              // TODO.MD #3.3: while a turn is running, Send becomes Stop
              <Button type="button" variant="destructive" size="sm" onClick={handleStop}>
                <SquareIcon className="h-4 w-4 mr-1" /> Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim() || inFlight} size="sm">
                <SendIcon className="h-4 w-4 mr-1" /> Send
              </Button>
            )}
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
    </TooltipProvider>
  )
}
