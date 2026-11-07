"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ChatMessage, CampaignCheckpoint, CharacterData, CampaignNotes, SavedCheckpointRef } from "@/lib/types"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  PencilIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareIcon,
  TrashIcon,
  RefreshCwIcon,
} from "lucide-react"
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
import MessageImageRender from "./message-image-render"
import { formatCharacterData } from "@/lib/format-character-data"
import { campaignCheckpointTools, runCheckpointTool, formatCheckpoint, saveCheckpoints, isCheckpointSaveOnly, extractNewCheckpoints, MAX_CHECKPOINTS_STORED } from "@/lib/campaign-checkpoints"
import { buildSystemMessageBase } from "@/lib/system-prompt"
import { collectLoot } from "@/lib/loot"
import type { LootEntry } from "@/lib/loot"
import { formatNotesForContext } from "@/lib/campaign-notes"
import { estimateContextTokens, estimateTokens, formatTokenCount } from "@/lib/context-estimate"
import {
  CALIBRATION_KEY,
  MIN_COMPACTABLE_MESSAGES,
  SUMMARY_CALL_RESERVE_TOKENS,
  applyCalibration,
  buildCompactionRequest,
  estimateMessageTokens,
  fitsWindowStart,
  formatTranscriptForCompaction,
  nextCalibration,
  planCompaction,
  sanitizeCompactionSettings,
  summaryWordBudget,
  type CompactionPlan,
  type CompactionSettings,
} from "@/lib/compaction"
import {
  clampImageRate,
  MIN_IMAGE_RATE,
  MAX_IMAGE_RATE,
  imageTool,
  IMAGE_TOOL_NAME,
  generateImage,
  createImageRateLimiter,
  type ImageRateLimiter,
} from "@/lib/image-gen"
import { putImage, deleteImage, clearImages, imageStoreFootprint } from "@/lib/image-store"
import { formatBytes } from "@/lib/storage-budget"
import {
  buildStats,
  combineLegContents,
  combineLegThinking,
  extractThinking,
  isAbortError,
  mergeUsage,
  readErrorDetail,
  statsLines,
  type ApiUsage,
  type AssistantTurn,
} from "@/lib/chat-turn"
import {
  accumulateToolCalls,
  createStreamFlusher,
  finalizeToolCalls,
  iterateStream,
  parseToolArgs,
  type ToolCallAcc,
} from "@/lib/stream"
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
  // Image generation (TODO #9) — optional; blank api-url disables the feature.
  imageApiUrl: string
  setImageApiUrl: React.Dispatch<React.SetStateAction<string>>
  // Optional dedicated key for the image endpoint; blank = reuse the chat API key.
  imageApiKey: string
  setImageApiKey: React.Dispatch<React.SetStateAction<string>>
  imageModel: string
  setImageModel: React.Dispatch<React.SetStateAction<string>>
  imageRate: number
  setImageRate: React.Dispatch<React.SetStateAction<number>>
  imageSize: string
  setImageSize: React.Dispatch<React.SetStateAction<string>>
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
  /** Context compaction (rolling summary): settings, the summary itself, and how many
      of the oldest messages it already covers (the compacted prefix). */
  compactionSettings: CompactionSettings
  setCompactionSettings: React.Dispatch<React.SetStateAction<CompactionSettings>>
  conversationSummary: string | null
  setConversationSummary: React.Dispatch<React.SetStateAction<string | null>>
  summaryCoversCount: number
  setSummaryCoversCount: React.Dispatch<React.SetStateAction<number>>
  /** Merge loot finds captured out of assistant messages into the page-level store (TODO #8, T8.1). */
  onLootCapture?: (entries: LootEntry[]) => void
  character: CharacterData
}

// Default number of previous messages included in the model context (also the shared
// initial state in app/page.tsx — was inconsistently 6 here vs 10 there)
export const DEFAULT_MAX_MESSAGES = 10
// Hard cap on the legacy "last N messages" window (owner 2026-11-07: raise 20 → 80;
// only reachable while auto-compact is off, where it replaces the token budget).
export const MAX_PREVIOUS_MESSAGES = 80

/**
 * T1.3: toast the real reason when the turn failed at the API itself (the error we
 * throw carries the provider's explanation, e.g. "API error: 401 — Invalid API key");
 * otherwise keep the generic actionable wording. Module-level so the turn callbacks
 * can use it without adding an unstable dep.
 */
function toastForTurnError(error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : ""
  toast.error(message.startsWith("API error") ? message : fallback)
}

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

// One tool-result message handed back to the API (the shape the getCharacterSheet and
// checkpoint tools already build at their call sites).
type ToolResultMessage = {
  tool_call_id: string
  role: "tool"
  name: string
  content: string
}

// The outcome of executing a batch of tool calls (TODO.MD #9): the per-call results to
// feed the follow-up leg, plus the optional scene image to attach to the completed turn,
// plus the checkpoints the batch saved in the background (so the completed turn can be
// badged with the ones it stored).
type ToolCallOutcome = {
  results: ToolResultMessage[]
  image?: { id: string; alt: string; src?: string }
  checkpointsSaved?: SavedCheckpointRef[]
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
    checkpoints,
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
    // The live checkpoint store, so a saved-checkpoint badge can resolve its popover
    // details (summary) by id. Identity only changes when a checkpoint is saved/pruned.
    checkpoints?: CampaignCheckpoint[]
  }) => {
    const isUser = message.role === "user"

    // T4.2: the action-bar popovers (turn stats; checkpoints saved in the background)
    // are tap-to-open POPOVERS, not tooltips — tooltips never fire on touch screens, and
    // these are a genuine glanceable datum, not decoration. Hand-rolled on the lightbox
    // precedent (no new dependency): toggled by click, closed by outside-pointer or
    // Escape. One shared state (which popover is open, if any) and one shared listener.
    const [openPopover, setOpenPopover] = useState<"stats" | "checkpoint" | null>(null)
    const statsRef = useRef<HTMLDivElement>(null)
    const checkpointRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
      if (openPopover === null) return
      const activeRef = openPopover === "stats" ? statsRef : checkpointRef
      const onPointerDown = (e: PointerEvent) => {
        if (activeRef.current && !activeRef.current.contains(e.target as Node)) {
          setOpenPopover(null)
        }
      }
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpenPopover(null)
      }
      document.addEventListener("pointerdown", onPointerDown)
      document.addEventListener("keydown", onKeyDown)
      return () => {
        document.removeEventListener("pointerdown", onPointerDown)
        document.removeEventListener("keydown", onKeyDown)
      }
    }, [openPopover])

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
            {/* TODO.MD #3.4: per-turn stats (tokens in/out, context, speed, duration)
                T4.2: tap-to-open popover (touches can't hover); opens toward the
                bubble on the right, vertically centered on the button. */}
            {!isUser && message.stats && (
              <div className="relative" ref={statsRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-muted"
                  title="Turn statistics"
                  aria-label="Turn statistics"
                  aria-haspopup="true"
                  aria-expanded={openPopover === "stats"}
                  onClick={() => setOpenPopover(openPopover === "stats" ? null : "stats")}
                >
                  <InfoIcon className="h-3 w-3" />
                </Button>
                {openPopover === "stats" && (
                  <div
                    className="absolute left-full top-1/2 z-40 ml-2 w-max max-w-[260px] -translate-y-1/2 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
                    role="group"
                    aria-label="Turn statistics"
                  >
                    <div className="grid grid-cols-[max-content_max-content] gap-x-3 gap-y-0.5">
                      {statsLines(message.stats).map((line) => (
                        <span key={line.label} className="contents">
                          <span className="pr-1 opacity-60">{line.label}</span>
                          <span className="whitespace-nowrap">{line.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Checkpoint saved in the background (saveCampaignCheckpoint ran after the
                narration, follow-up leg skipped). The badge carries only small references;
                details resolve against the live checkpoint store by id when still stored,
                and degrade to title + time when the store has pruned them. */}
            {!isUser && message.checkpointsSaved && message.checkpointsSaved.length > 0 && (
              <div className="relative" ref={checkpointRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-muted"
                  title="Checkpoint saved"
                  aria-label={
                    message.checkpointsSaved.length === 1
                      ? "View saved checkpoint"
                      : `View ${message.checkpointsSaved.length} saved checkpoints`
                  }
                  aria-haspopup="true"
                  aria-expanded={openPopover === "checkpoint"}
                  onClick={() => setOpenPopover(openPopover === "checkpoint" ? null : "checkpoint")}
                >
                  <ShieldCheckIcon className="h-3 w-3" />
                </Button>
                {openPopover === "checkpoint" && (
                  <div
                    className="absolute left-full top-1/2 z-40 ml-2 w-max max-w-[280px] -translate-y-1/2 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md"
                    role="group"
                    aria-label="Saved checkpoints"
                  >
                    <div className="mb-1 font-medium">
                      {message.checkpointsSaved.length === 1 ? "Checkpoint saved" : "Checkpoints saved"}
                    </div>
                    {message.checkpointsSaved.map((ref) => {
                      const stored = checkpoints?.find((c) => c.id === ref.id)
                      return (
                        <div key={ref.id} className="mb-1.5 last:mb-0">
                          <div className="font-medium">{ref.title}</div>
                          <div className="opacity-60">
                            saved {new Date(ref.createdAt).toLocaleString()}
                          </div>
                          {stored ? (
                            <div className="mt-0.5">{stored.summary}</div>
                          ) : (
                            <div className="mt-0.5 opacity-60">
                              (pruned from the checkpoint store — full record no longer kept)
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
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
                  // Player voice gets its own calm surface (--user-bubble), not the
                  // full-strength primary amber — distinct from the DM's muted bubble
                  // without shouting.
                  : "bg-user-bubble text-user-bubble-foreground"
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
              // T2.1 follow-up: the player's own newlines (Shift+Enter) must survive the
              // round trip — a raw text node under white-space:normal is CSS-whitespace
              // and the line breaks silently collapse into spaces. pre-wrap keeps them;
              // overflow-wrap-anywhere still breaks long unbroken strings (URLs, item ids).
              <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</div>
            ) : (
              <>
                {/* Scene image (TODO.MD #9.2): centered at the top of the bubble, above
                    the narration. Renders a 720p thumbnail + full-size lightbox. */}
                {message.image && (
                  <div className="mb-2">
                    <MessageImageRender id={message.image.id} alt={message.image.alt} />
                  </div>
                )}
                <MarkdownRenderer content={message.content} thinking={message.thinking} />
              </>
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
    showThinking,
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
    checkpoints,
  }: {
    messages: ChatMessage[]
    showThinking: boolean
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
    checkpoints?: CampaignCheckpoint[]
  }) => {
    return (
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No messages yet. Start a conversation with your AI assistant!
          </div>
        ) : (
          messages.map((message) => {
            // T1.1: each bubble must keep STABLE props when it is not the edit target,
            // or its memo() is defeated — and every keystroke in the inline editor
            // (whose onChange recreates `saveEdit` and mutates `editDraft`) would
            // re-render and re-parse the markdown of the ENTIRE history. Scope the
            // edit state to the edited bubble only; everyone else gets stable undefined.
            const isEditTarget = editingId === message.id
            return (
              <ChatMessageComponent
                key={message.id}
                message={message}
                onDelete={onDeleteMessage}
                onRegenerate={message.role === "assistant" ? onRegenerateMessage : undefined}
                isRegenerating={regeneratingId === message.id}
                onEdit={message.role === "user" ? onEdit : undefined}
                isEditing={isEditTarget}
                editDraft={isEditTarget ? editDraft : undefined}
                onEditDraftChange={isEditTarget ? onEditDraftChange : undefined}
                onSaveEdit={isEditTarget ? onSaveEdit : undefined}
                onCancelEdit={isEditTarget ? onCancelEdit : undefined}
                inFlight={inFlight}
                checkpoints={checkpoints}
              />
            )
          })
        )}
        {showThinking && (
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

/**
 * Assembles the system message for one turn (T5.2). Module scope so it is the single
 * source of truth for the turn's context: `callApi` sends exactly this, and the
 * settings dialog's context estimate is built from the same helper — so the two can
 * never drift apart.
 *
 * What goes in: the built-in DM prompt or the owner's custom one (TODO #7), campaign
 * notes when opted in (T2.3), the latest saved checkpoint block when one exists, the
 * tool instructions, and the scene-image guidance — the last only when an image
 * endpoint is configured (TODO #9; blank URL means the feature is entirely off).
 */
function buildTurnSystemMessage(params: {
  systemPrompt: string
  notesInContext: boolean
  campaignNotes: CampaignNotes
  campaignCheckpoints: CampaignCheckpoint[]
  imageEnabled: boolean
  /** The rolling compaction summary (older history), when one exists */
  conversationSummary?: string | null
}): string {
  const { systemPrompt, notesInContext, campaignNotes, campaignCheckpoints, imageEnabled, conversationSummary } = params

  const toolInstructions = `
You have access to the player's character sheet through a tool. You can access it by calling the getCharacterSheet function.
Use this tool when you need to reference the character's stats, abilities, inventory, or other details.
DO NOT mention that you're using this tool to the player - just incorporate the information naturally in your responses.

You also have two tools for long-term campaign memory, because older chat messages eventually drop out of your context:
- saveCampaignCheckpoint: call it at natural stopping points, such as the end of a scene, arrival at a new location, a major decision or revelation, a quest starting or finishing, or when the player says they are wrapping up. Record where the story stands and what you would need to pick it back up later. Do not save a checkpoint after every message.
- getCampaignCheckpoints: call it when a conversation begins or resumes with little prior context, when the player asks for a recap or says they are continuing, or when you are unsure about earlier events.
DO NOT mention these tools to the player - use them quietly and just continue the story.
`

  const imageInstructions = imageEnabled
    ? `\nYou can depict major moments with the ${IMAGE_TOOL_NAME} tool. For a significant scene change, arriving in a new location, or the introduction of an important character, you MAY generate one image to set the scene. Use it sparingly — only for these major moments — because it is rate-limited; for everything else rely on your written narration. When the tool confirms the image was shown, trust that the player can see it: continue the story rather than re-describing it.
`
    : ""

  // The custom prompt wins if set, otherwise the built-in DM prompt (TODO #7),
  // plus the loot-capture section appended to BOTH (TODO #8 — owner decision).
  return `${buildSystemMessageBase(systemPrompt)}\n\n${
    notesInContext ? formatNotesForContext(campaignNotes) : ""
  }${
    conversationSummary && conversationSummary.trim()
      ? `CONVERSATION SUMMARY (the story BEFORE the recent messages, from an earlier context compaction — established fact; the latest messages follow it):\n${conversationSummary.trim()}\n\n`
      : ""
  }${
    campaignCheckpoints.length > 0
      ? `CAMPAIGN CONTEXT (from the latest saved checkpoint):\n${formatCheckpoint(campaignCheckpoints[campaignCheckpoints.length - 1])}\n\n`
      : ""
  }${toolInstructions}${imageInstructions}\nPlease keep this context in mind when responding.`
}

export default function ChatInterface({
  messages,
  setMessages,
  apiUrl,
  setApiUrl,
  apiKey,
  setApiKey,
  model,
  setModel,
  imageApiUrl,
  setImageApiUrl,
  imageApiKey,
  setImageApiKey,
  imageModel,
  setImageModel,
  imageRate,
  setImageRate,
  imageSize,
  setImageSize,
  systemPrompt,
  setSystemPrompt,
  campaignNotes,
  notesInContext,
  campaignCheckpoints,
  setCampaignCheckpoints,
  maxMessages,
  setMaxMessages,
  compactionSettings,
  setCompactionSettings,
  conversationSummary,
  setConversationSummary,
  summaryCoversCount,
  setSummaryCoversCount,
  onLootCapture,
  character,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // T1.2: true once the current turn has produced visible content. The "Thinking…"
  // placeholder then only shows while the turn is still silent (pre-LLM latency, the
  // tool round-trip, image generation) — never below a bubble that is already typing.
  const [turnHasContent, setTurnHasContent] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  // Settings dialog: the image-generation block is an expandable section that starts
  // collapsed (owner 2026-11-05) so the dialog stays focused on the chat settings.
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)
  // T1.4: stored scene-image footprint (count + bytes), loaded when the dialog opens —
  // the per-image 4 MB cap exists but the TOTAL was otherwise invisible.
  const [imageFootprint, setImageFootprint] = useState<{ count: number; bytes: number } | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  // TODO.MD #3.2: the user message currently in inline edit, and its draft text
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // T5.2: context-size transparency. Rough estimate (~4 chars/token + 4/message) of
  // what the NEXT turn will send: the same resolved system message callApi uses
  // (buildTurnSystemMessage) plus the last `maxMessages` of history — the exact
  // window callApi slices before sending. Shown under "Max Previous Messages" in
  // the settings dialog so "context length exceeded" becomes a number you can act
  // on (lower the limit, trim the prompt/notes) instead of a mystery.
  // T5.2: context-size transparency. A rough, honest figure (~4 chars/token + 4/message)
  // of what the NEXT turn will send — the same resolved system message callApi uses
  // (including the rolling summary when one exists) PLUS the raw tail the send path
  // will window. With compaction on that tail is budget-fit; with it off, the legacy
  // "last N messages". Shown in settings so "context length exceeded" becomes a number
  // you can act on instead of a mystery.
  const contextEstimate = useMemo(() => {
    const systemMessage = buildTurnSystemMessage({
      systemPrompt,
      notesInContext,
      campaignNotes,
      campaignCheckpoints,
      imageEnabled: imageApiUrl.trim().length > 0,
      conversationSummary,
    })
    if (compactionSettings.enabled) {
      const covered = Math.max(0, Math.min(summaryCoversCount, messages.length))
      const budget = Math.max(0, compactionSettings.ceilingTokens - estimateTokens(systemMessage))
      const start = fitsWindowStart(
        messages.slice(covered).map((m) => estimateMessageTokens(m.content)),
        0,
        budget,
      )
      return estimateContextTokens(systemMessage, messages.slice(covered + start))
    }
    return estimateContextTokens(systemMessage, messages.slice(-maxMessages))
  }, [
    systemPrompt,
    notesInContext,
    campaignNotes,
    campaignCheckpoints,
    imageApiUrl,
    messages,
    maxMessages,
    compactionSettings,
    conversationSummary,
    summaryCoversCount,
  ])

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

  // Total message count, mirrored so the image rate limiter (which keys on the running
  // conversation length, not the trimmed window passed to callApi) sees the live value.
  const messagesCountRef = useRef(messages.length)
  useEffect(() => {
    messagesCountRef.current = messages.length
  }, [messages])

  // Image rate limiter (TODO.MD #9.3, owner D3): allows one generated image per
  // imageRate messages. Recreated when the setting changes so the new window applies
  // immediately (and a deliberate reset is allowed); in-memory only — a reload starts
  // a fresh window, by design.
  const imageRateLimiterRef = useRef(createImageRateLimiter(imageRate))
  useEffect(() => {
    imageRateLimiterRef.current = createImageRateLimiter(imageRate)
  }, [imageRate])

  // T1.4: refresh the stored scene footprint on each dialog open (one cheap IDB read;
  // resolves a clean result even where IndexedDB is unavailable).
  const refreshImageFootprint = useCallback(async () => {
    const result = await imageStoreFootprint()
    setImageFootprint(result.ok && result.value ? result.value : null)
  }, [])

  // Calculate and set the chat height based on window size
  const updateChatHeight = useCallback(() => {
    if (containerRef.current) {
      const windowHeight = window.innerHeight
      const containerRect = containerRef.current.getBoundingClientRect()
      const containerTop = containerRect.top
      const headerHeight = 40 // Approximate height of the chat header
      const padding = 24 // Some padding

      // The composer footer is auto-height (T2.1 multiline input) and sits INSIDE the
      // card's fixed height, so it no longer needs its own subtraction here.
      const newHeight = windowHeight - containerTop - headerHeight - padding
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

  // Function to handle tool calls (character sheet + campaign checkpoints + scene image).
  // Async because the generateImage tool performs a network call and an IndexedDB write
  // (TODO.MD #9.2). Returns the per-call results for the follow-up leg plus the optional
  // scene image to attach to the completed turn (at most one — the first that succeeds).
  const handleToolCalls = useCallback(
    async (toolCalls: any[]): Promise<ToolCallOutcome> => {
      const results: ToolResultMessage[] = []
      let image: ToolCallOutcome["image"]
      const startCheckpoints = checkpointsRef.current
      let workingCheckpoints = startCheckpoints

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

        // Scene image (TODO.MD #9.2): rate-limited, then generated and persisted to
        // IndexedDB. Any failure (rate limit, no IDB, over-cap, API error) degrades to a
        // "describe it in words" instruction so the turn always completes.
        if (toolName === IMAGE_TOOL_NAME) {
          const args = parseToolArgs(toolCall.function.arguments)
          const prompt = typeof args.prompt === "string" ? args.prompt.trim() : ""
          const alt = typeof args.alt === "string" && args.alt.trim() ? args.alt.trim() : prompt || "Generated scene"

          const messageCount = messagesCountRef.current
          if (!imageRateLimiterRef.current.can(messageCount)) {
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                "Image generation is rate-limited right now (too soon since the last image). " +
                "Do not request another; instead describe this scene, character, or moment in " +
                "vivid written narration and continue the story.",
            })
            continue
          }

          try {
            if (!prompt) {
              throw new Error("missing prompt")
            }
            const generated = await generateImage(
              {
                apiUrl: imageApiUrl,
                // A dedicated image key wins when set; otherwise fall back to the chat key
                // (most single-provider setups need only one key).
                apiKey: imageApiKey.trim() ? imageApiKey.trim() : apiKey || undefined,
                model: imageModel || undefined,
                size: imageSize,
                signal: abortRef.current?.signal,
              },
              prompt,
            )
            const id = crypto.randomUUID()
            const stored = await putImage({ id, alt, src: generated.src, mime: generated.mime })
            if (!stored.ok) {
              // Could not persist (no IDB, private browsing, or over the per-image cap):
              // ask the model to carry the scene in words instead of leaving an empty bubble.
              results.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolName,
                content:
                  `The generated image could not be stored (${stored.reason ?? "unknown reason"}). ` +
                  "Describe this scene in words instead and continue the story.",
              })
              continue
            }
            // Remember the image for the turn and record the rate-limit anchor.
            image = { id, alt, src: generated.src }
            imageRateLimiterRef.current.mark(messageCount)
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                `Scene image generated and shown to the player (alt: "${alt}"). ` +
                "The player can see it, so do not re-describe it in detail — continue the story.",
            })
          } catch (error) {
            // A user-initiated abort must surface as an error (the caller shows "Stopped.");
            // any other failure degrades to written narration.
            if (isAbortError(error)) throw error
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                "Image generation failed this time. Describe this scene, character, or moment in " +
                "words and continue the story.",
            })
          }
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

      // The checkpoints this batch saved in the background (none → an empty array; the
      // caller attaches it to the turn only when non-empty, so plain turns serialize
      // with no new field at all).
      const checkpointsSaved = extractNewCheckpoints(startCheckpoints, workingCheckpoints).map(
        (checkpoint) => ({ id: checkpoint.id, title: checkpoint.title, createdAt: checkpoint.createdAt }),
      )

      return {
        results,
        image,
        checkpointsSaved: checkpointsSaved.length > 0 ? checkpointsSaved : undefined,
      }
    },
    [character, setCampaignCheckpoints, imageApiUrl, apiKey, imageApiKey, imageModel, imageSize],
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
        // Prepare the system message — the shared helper above is the single source
        // of truth (T5.2), so the settings dialog's estimate tracks exactly what is
        // sent. `imageEnabled` doubles as the gate for advertising the image TOOL.
        const imageEnabled = imageApiUrl.trim().length > 0
        const systemMessage = {
          role: "system",
          content: buildTurnSystemMessage({
            systemPrompt,
            notesInContext,
            campaignNotes,
            campaignCheckpoints,
            imageEnabled,
            // The rolling compaction summary (older story) rides here — the caller
            // already excluded its messages from `conversation`
            conversationSummary,
          }),
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
        // `prefix` is text to prepend to every onDelta report (leg two gets leg one's
        // text) so the bubble only ever grows across the tool round-trip; the leg's own
        // returned content stays raw, because that is what the API conversation needs.
        const runLeg = async (payload: Record<string, unknown>, prefix = "") => {
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
            // T1.3: surface the provider's own explanation (bad key, context overflow,
            // unknown model, ...) — the status line alone leaves the user guessing.
            const detail = await readErrorDetail(response)
            throw new Error(detail ? `API error: ${response.status} — ${detail}` : `API error: ${response.status}`)
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
                onDelta?.(prefix + content)
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
            if (prefix || content) onDelta?.(prefix + content)
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
          tools: [CHARACTER_SHEET_TOOL, ...campaignCheckpointTools, ...(imageEnabled ? [imageTool] : [])],
          tool_choice: "auto",
          stream: true,
          stream_options: { include_usage: true },
        })

        // Calibrate the (deliberately dumb) chars/4 estimator against the provider's own
        // count for THIS request: the ratio absorbs the tool-schema + overhead tokens the
        // heuristic can't see, so planning/windowing track reality per endpoint.
        if (leg1.usage && typeof leg1.usage.prompt_tokens === "number" && leg1.usage.prompt_tokens > 0) {
          const estimated = estimateContextTokens(systemMessage.content, conversation).total
          const next = nextCalibration(calibrationRef.current, estimated, leg1.usage.prompt_tokens)
          if (next !== calibrationRef.current) {
            calibrationRef.current = next
            try {
              window.localStorage.setItem(CALIBRATION_KEY, String(next))
            } catch {
              /* private mode / storage full — estimation keeps the session value */
            }
          }
        }

        if (leg1.toolCalls.length > 0) {
          // handleToolCalls is async (the generateImage tool performs a network call and an
          // IndexedDB write). It returns the per-call results for the follow-up leg plus the
          // optional scene image to attach to the completed turn.
          const outcome = await handleToolCalls(leg1.toolCalls)
          const { results: toolResults, image } = outcome

          // Checkpoint-only leg with real narration already on the bubble: the turn is DONE.
          // A save is pure bookkeeping — its localStorage side effect landed inside
          // handleToolCalls above, and its tool result is just a confirmation the player
          // never needs. Skipping the follow-up request is what stops the model from
          // re-narrating the scene and re-asking "What do you do?" minutes after the turn
          // already ended (owner-reported checkpoint bug). Mixed legs — save alongside a
          // sheet lookup, checkpoint fetch, or image — still take the follow-up, because
          // THAT leg is the answer the model must build from the other tools' results.
          if (isCheckpointSaveOnly(leg1.toolCalls) && leg1.content.trim().length > 0) {
            return {
              content: leg1.content,
              thinking: leg1.thinking,
              stats: buildStats(leg1.usage, startedAt, conversation.length),
              // The save happened in the background (no follow-up leg was made) — badge
              // the turn with what it stored.
              ...(outcome.checkpointsSaved ? { checkpointsSaved: outcome.checkpointsSaved } : {}),
            }
          }

          const firstMessage = {
            role: "assistant",
            content: leg1.content || null,
            tool_calls: leg1.toolCalls,
          }
          // Leg two streams with leg one's text prepended so the bubble grows instead of
          // being replaced mid-turn (this is what wiped the narration before a checkpoint).
          const leg2 = await runLeg(
            {
              model: model,
              messages: [...apiMessages, firstMessage, ...toolResults],
              stream: true,
              stream_options: { include_usage: true },
            },
            leg1.content,
          )
          return {
            // The persisted turn is BOTH legs: leg one's narration up to the tool call
            // plus leg two's continuation. Dropping leg one here was the permanent-loss half.
            content: combineLegContents(leg1.content, leg2.content),
            thinking: combineLegThinking(leg1.thinking, leg2.thinking),
            stats: buildStats(mergeUsage(leg1.usage, leg2.usage), startedAt, conversation.length),
            ...(image ? { image } : {}),
            // A mixed leg (checkpoint save alongside another tool) still badges what it stored.
            ...(outcome.checkpointsSaved ? { checkpointsSaved: outcome.checkpointsSaved } : {}),
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
    [model, apiKey, apiUrl, imageApiUrl, systemPrompt, campaignNotes, notesInContext, campaignCheckpoints, conversationSummary, handleToolCalls],
  )

  // Shared turn bookkeeping: creates the assistant bubble under a stable id up front
  // (so streaming deltas — TODO.MD #3.6 — and the final turn all land on the same
  // bubble), then settles it with the normalized turn content, thinking, and stats.
  // Pass an existing assistant bubble id (regenerate) to update it in place, or omit
  // the id (send/edit) to append a new bubble.
  const runAssistant = useCallback(
    async (conversation: ChatMessage[], bubbleId?: string) => {
      const id = bubbleId ?? crypto.randomUUID()
      setTurnHasContent(false)

      const upsertContent = (content: string) => {
        if (content) setTurnHasContent(true)
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

      // T3.1: coalesce the stream's per-chunk deltas into at most one commit per
      // animation frame — every commit re-parses the bubble's markdown and re-scans
      // it for loot fences, so committing at chunk rate is ~O(n²) on long narration.
      // `push` is freshest-wins (callApi passes the accumulated content, not an
      // increment); `flush` settles the final value before the turn's bookkeeping
      // write below, and `cancel` drops any pending frame on a failed/aborted turn.
      const contentSink = createStreamFlusher(upsertContent)
      let turn: AssistantTurn
      try {
        turn = await callApi(conversation, (content) => contentSink.push(content))
        contentSink.flush()
      } catch (error) {
        contentSink.cancel()
        throw error
      }

      setMessages((prev) => {
        const index = prev.findIndex((message) => message.id === id)
        const finalMessage: ChatMessage = {
          id,
          role: "assistant",
          content: turn.content,
          thinking: turn.thinking,
          stats: turn.stats,
          // Persist only the small IndexedDB reference (id + alt) — the image bytes live in
          // IndexedDB (lib/image-store.ts) and are fetched by the renderer on demand.
          // Undefined (a non-image turn) serializes to nothing, keeping the record tiny.
          image: turn.image ? { id: turn.image.id, alt: turn.image.alt } : undefined,
          // Checkpoint badges persist their small references too (old saves simply lack
          // the field), so the shield icon survives a reload of a conversation.
          checkpointsSaved: turn.checkpointsSaved,
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

  // ---------------------------------------------------------------------------
  // Context compaction (rolling summary, OpenCode-style): instead of a fixed
  // "last N messages" window, one turn's context is a TOKEN budget —
  //   system + rolling summary + raw tail ≤ ceiling
  // When history outgrows the budget, the OLDEST raw messages are folded into the
  // rolling summary (the newest `keepMessages` always ride verbatim), the summary
  // carries that history forward, and an automatic checkpoint anchors the story
  // state (owner decision: auto-checkpoint per compaction). The full chat array is
  // never mutated — UI + persistence keep every message.
  // ---------------------------------------------------------------------------
  const [compacting, setCompacting] = useState(false)
  // Learned estimate→actual token ratio (absorbs tool schemas + overhead the chars/4
  // heuristic can't see). localStorage-mirrored; a session-only value in private mode.
  const [initialCalibration] = useState<number>(() => {
    try {
      const value = Number(window.localStorage.getItem(CALIBRATION_KEY))
      return Number.isFinite(value) && value > 0 ? value : 1
    } catch {
      return 1
    }
  })
  const calibrationRef = useRef(initialCalibration)

  /** The next turn's plan: what to fold into the summary, and the raw tail to send. */
  const planContext = useCallback(
    (force: boolean) => {
      const cal = calibrationRef.current
      const covered = Math.max(0, Math.min(summaryCoversCount, messages.length))
      const rawMessages = messages.slice(covered)
      const systemMessage = buildTurnSystemMessage({
        systemPrompt,
        notesInContext,
        campaignNotes,
        campaignCheckpoints,
        imageEnabled: imageApiUrl.trim().length > 0,
        conversationSummary: null,
      })
      const plan = planCompaction({
        messageTokens: rawMessages.map((m) => applyCalibration(estimateMessageTokens(m.content), cal)),
        summaryTokens: conversationSummary ? applyCalibration(estimateTokens(conversationSummary), cal) : 0,
        systemTokens: applyCalibration(estimateTokens(systemMessage), cal),
        ceilingTokens: compactionSettings.ceilingTokens,
        compactTargetTokens: compactionSettings.compactTargetTokens,
        keepMessages: compactionSettings.keepMessages,
        force,
      })
      return { plan, covered, rawMessages }
    },
    [
      messages,
      summaryCoversCount,
      systemPrompt,
      notesInContext,
      campaignNotes,
      campaignCheckpoints,
      imageApiUrl,
      conversationSummary,
      compactionSettings,
    ],
  )

  /**
   * Runs the compaction passes of one computed plan (oldest-first, each pass MERGING
   * into the rolling summary), then commits: new summary, advanced coverage boundary,
   * and the automatic checkpoint. Throws on the first failed pass — nothing is
   * committed when a pass fails, so the next event retries from the same boundary.
   */
  const performCompaction = useCallback(
    async (plan: CompactionPlan, covered: number, rawMessages: ChatMessage[]): Promise<void> => {
      const cal = calibrationRef.current
      let summary = conversationSummary
      let folded = 0
      for (const span of plan.passes) {
        const request = buildCompactionRequest(
          summary,
          formatTranscriptForCompaction(rawMessages.slice(span.from, span.to)),
          // Word budget from the summary's token slot (ceiling − call reserve − the
          // existing summary − a share for the kept tail)
          summaryWordBudget(
            Math.max(
              500,
              compactionSettings.ceilingTokens -
                SUMMARY_CALL_RESERVE_TOKENS -
                (summary ? applyCalibration(estimateTokens(summary), cal) : 0) -
                Math.round(compactionSettings.compactTargetTokens * 0.5),
            ),
          ),
        )
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            temperature: 0.2,
          }),
          // The Stop button governs compaction too (one shared controller per event)
          signal: abortRef.current?.signal,
        })
        if (!response.ok) {
          const detail = await readErrorDetail(response)
          throw new Error(detail ? `Compaction failed: ${response.status} — ${detail}` : `Compaction failed: ${response.status}`)
        }
        // Some endpoints honor the plain request (one JSON document); others stream
        // SSE regardless — accumulate whichever arrives.
        const contentType = response.headers.get("content-type") ?? ""
        let text = ""
        if (contentType.includes("text/event-stream") && response.body) {
          for await (const chunk of iterateStream(response.body)) {
            if (typeof chunk !== "object" || chunk === null) continue
            const c = chunk as Record<string, unknown>
            const choices = Array.isArray(c.choices) ? (c.choices as Array<Record<string, unknown>>) : []
            const delta = choices[0]?.delta as Record<string, unknown> | undefined
            if (delta && typeof delta.content === "string") text += delta.content
          }
        } else {
          const data = (await response.json()) as Record<string, unknown>
          const choices = Array.isArray(data.choices) ? (data.choices as Array<Record<string, unknown>>) : []
          const first = choices[0] ?? {}
          const message = (typeof first.message === "object" && first.message !== null ? first.message : {}) as Record<string, unknown>
          text = typeof message.content === "string" ? message.content : typeof first.content === "string" ? (first.content as string) : ""
        }
        const cleaned = text.trim()
        if (!cleaned) throw new Error("Compaction failed: the model returned an empty summary")
        summary = cleaned
        folded += span.to - span.from
      }

      // Commit: the summary grows, the coverage boundary advances past everything
      // folded, and the automatic checkpoint gives the story state a durable anchor.
      setConversationSummary(summary)
      setSummaryCoversCount(covered + plan.passes[plan.passes.length - 1].to)
      const autoCheckpoint: CampaignCheckpoint = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: `Story state — ${new Date().toLocaleDateString()}`,
        summary: summary as string,
      }
      // Same write-time persistence as the saveCampaignCheckpoint tool: the store is
      // capped at MAX_CHECKPOINTS_STORED (oldest pruned), saved to localStorage, and
      // the state update follows — so a closed tab right after compaction loses nothing.
      const nextCheckpoints = [...campaignCheckpoints, autoCheckpoint]
      const pruned = Math.max(0, nextCheckpoints.length - MAX_CHECKPOINTS_STORED)
      const checkpoints = pruned > 0 ? nextCheckpoints.slice(pruned) : nextCheckpoints
      const checkpointResult = saveCheckpoints(checkpoints)
      if (checkpointResult.ok) {
        setCampaignCheckpoints(checkpoints)
      } else {
        toast.warning(
          `Compacted ${folded} older message${folded === 1 ? "" : "s"}, but the checkpoint could not be saved (${checkpointResult.error ?? "storage error"}).`,
        )
        return
      }
      toast.success(`Compacted ${folded} older message${folded === 1 ? "" : "s"} into the running summary and saved a checkpoint.`)
    },
    [campaignCheckpoints, conversationSummary, compactionSettings, apiUrl, apiKey, model, setConversationSummary, setSummaryCoversCount, setCampaignCheckpoints],
  )

  /** Manual "Compact now" — force a plan and run it. Returns true when it compacted. */
  const compactConversation = useCallback(
    async (force: boolean): Promise<boolean> => {
      if (compacting) return false
      const { plan, covered, rawMessages } = planContext(force)
      if (plan.passes.length === 0) {
        if (force) {
          toast.info(
            plan.compactableCount < MIN_COMPACTABLE_MESSAGES
              ? "Not enough history to compact yet."
              : "Nothing to compact — the context already fits within its limits.",
          )
        }
        return false
      }
      setCompacting(true)
      try {
        abortRef.current = new AbortController()
        await performCompaction(plan, covered, rawMessages)
        return true
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
        } else {
          console.error("Error compacting the conversation:", error)
          toast.error(
            error instanceof Error && error.message.startsWith("Compaction failed")
              ? error.message
              : "Compaction failed — the recent messages stay in context; the rest waits for the next compaction.",
          )
        }
        return false
      } finally {
        setCompacting(false)
      }
    },
    [compacting, planContext, performCompaction],
  )

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
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
        // Context window: with compaction on, a token budget (the rolling summary of
        // older history rides in the system message; compact first if history outgrew
        // the budget); with it off, the legacy "last N messages" window.
        let conversation: ChatMessage[]
        if (compactionSettings.enabled) {
          const { plan, covered, rawMessages } = planContext(false)
          let compacted = false
          if (plan.passes.length > 0) {
            abortRef.current = new AbortController()
            try {
              await performCompaction(plan, covered, rawMessages)
              compacted = true
            } catch (error) {
              if (isAbortError(error)) {
                toast.info("Compaction stopped — sending without it.")
              } else {
                console.error("Error compacting the conversation:", error)
                toast.error(
                  error instanceof Error && error.message.startsWith("Compaction failed")
                    ? error.message
                    : "Compaction failed — the recent messages stay in context; the rest waits for the next compaction.",
                )
              }
            }
          }
          // The window is always computed against the EFFECTIVE (post-event) state:
          // on success the plan's sendsFrom (summary merged, boundary advanced); on
          // failure the un-compacted raw region fits around the OLD summary — so no
          // message is ever both un-summarized and un-sent.
          let sendStart: number
          if (compacted) {
            sendStart = covered + plan.sendsFrom
          } else {
            const cal = calibrationRef.current
            const systemTokens = applyCalibration(
              estimateTokens(
                buildTurnSystemMessage({
                  systemPrompt,
                  notesInContext,
                  campaignNotes,
                  campaignCheckpoints,
                  imageEnabled: imageApiUrl.trim().length > 0,
                  conversationSummary: null,
                }),
              ),
              cal,
            )
            const summaryTokens = conversationSummary ? applyCalibration(estimateTokens(conversationSummary), cal) : 0
            sendStart =
              covered +
              fitsWindowStart(
                messages.slice(covered).map((m) => applyCalibration(estimateMessageTokens(m.content), cal)),
                summaryTokens,
                Math.max(0, compactionSettings.ceilingTokens - systemTokens),
              )
          }
          conversation = [...messages.slice(sendStart), userMessage]
          console.log(`Sending ${conversation.length} messages (of ${messages.length + 1}) — compaction ${compacted ? "ran" : "skipped"}.`)
        } else {
          const recentMessages = messages.slice(-maxMessages)
          conversation = [...recentMessages, userMessage]
          console.log(`Using ${recentMessages.length} recent messages out of ${messages.length} total (limit: ${maxMessages})`)
        }

        abortRef.current = new AbortController()
        await runAssistant(conversation)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error calling API:", error)
        // Ephemeral notification only — never persist error text into history, where it
        // would be replayed into model context on every subsequent request
        toastForTurnError(
          error,
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
    [
      input,
      messages,
      maxMessages,
      setMessages,
      runAssistant,
      compactionSettings,
      conversationSummary,
      planContext,
      performCompaction,
      systemPrompt,
      notesInContext,
      campaignNotes,
      campaignCheckpoints,
      imageApiUrl,
    ],
  )

  const handleDeleteMessage = useCallback(
    (id: string) => {
      // Free the IndexedDB blob behind the deleted message (TODO.MD #9.2). deleteImage is
      // fire-and-forget and never throws, so a pending store write can't block the removal.
      const target = messages.find((msg) => msg.id === id)
      if (target?.image?.id) void deleteImage(target.image.id)

      // The compaction coverage is a PREFIX length of `messages`: deleting inside the
      // covered region shifts the boundary back by one (the summary already carries
      // that text, so nothing is lost either way).
      const deletedIndex = messages.findIndex((msg) => msg.id === id)
      if (deletedIndex !== -1 && deletedIndex < summaryCoversCount) {
        setSummaryCoversCount((prev) => Math.max(0, prev - 1))
      }

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
    [messages, setMessages, summaryCoversCount, setSummaryCoversCount],
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
        // Rebuild the context the same way a fresh send would. With compaction on the
        // prefix is budget-windowed (the rolling summary rides in the system message);
        // with it off, keep the legacy "everything before this turn" behavior.
        let conversation: ChatMessage[]
        const prefix = messages.slice(0, userIndex)
        if (compactionSettings.enabled) {
          const cal = calibrationRef.current
          const covered = Math.max(0, Math.min(summaryCoversCount, prefix.length))
          const effRaw = prefix.slice(covered)
          const systemTokens = applyCalibration(
            estimateTokens(
              buildTurnSystemMessage({
                systemPrompt,
                notesInContext,
                campaignNotes,
                campaignCheckpoints,
                imageEnabled: imageApiUrl.trim().length > 0,
                conversationSummary: null,
              }),
            ),
            cal,
          )
          const summaryTokens = conversationSummary ? applyCalibration(estimateTokens(conversationSummary), cal) : 0
          const start =
            covered +
            fitsWindowStart(
              effRaw.map((m) => applyCalibration(estimateMessageTokens(m.content), cal)),
              summaryTokens,
              Math.max(0, compactionSettings.ceilingTokens - systemTokens),
            )
          conversation = [...prefix.slice(start), userMessage]
        } else {
          conversation = [...prefix, userMessage]
        }
        abortRef.current = new AbortController()
        await runAssistant(conversation, id)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error regenerating message:", error)
        toastForTurnError(error, "Sorry, the response could not be regenerated.")
      } finally {
        setRegeneratingId(null)
      }
    },
    [
      messages,
      runAssistant,
      compactionSettings,
      conversationSummary,
      summaryCoversCount,
      systemPrompt,
      notesInContext,
      campaignNotes,
      campaignCheckpoints,
      imageApiUrl,
    ],
  )

  // TODO.MD #3.3: abort the in-flight turn (or the in-flight compaction — same
  // controller). Whatever content already rendered stays; the abort surfaces as a
  // neutral "Stopped." toast in the caller's catch.
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // True while any turn is running OR a message is in inline edit OR compaction is in
  // flight — gates the per-bubble actions and the composer so none of these interleave.
  const inFlight = isLoading || regeneratingId !== null || editingId !== null || compacting

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
        toastForTurnError(error, "Sorry, the edited chat could not be re-run.")
      } finally {
        setIsLoading(false)
      }
    },
    [messages, editDraft, runAssistant, setMessages],
  )

  const handleClearChat = useCallback(() => {
    // Free every stored scene image and reset the image rate limiter — the conversation is
    // gone, so the next message starts a fresh window (TODO.MD #9.2/#9.3).
    void clearImages()
    imageRateLimiterRef.current.reset()
    messagesCountRef.current = 0
    setMessages([])
    setIsAlertOpen(false)
  }, [setMessages])

  // Memoized input change handler to prevent re-renders (T2.1: the composer is a textarea now)
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  return (
  <div className="flex flex-col h-full" ref={containerRef}>
    <div className="flex justify-between items-center mb-4">
      <h2 className="text-lg font-bold">DM Chat</h2>
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
        <Dialog
          onOpenChange={(open) => {
            if (open) void refreshImageFootprint()
          }}
        >
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
                <div className="flex items-start justify-between gap-3">
                  <Label>Auto-compact context</Label>
                  <Switch
                    checked={compactionSettings.enabled}
                    onCheckedChange={(on) => setCompactionSettings((s) => sanitizeCompactionSettings({ ...s, enabled: on }))}
                    aria-label="Auto-compact context"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Long conversations are summarized (oldest first) into a rolling summary so pre-combat
                  context and story state survive, instead of dropping the oldest messages. A checkpoint
                  is saved with each compaction.
                </p>
              </div>
              {compactionSettings.enabled ? (
                <div className="space-y-3 sm:col-span-2">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="ctx-ceiling">Context ceiling (tokens)</Label>
                      <Input
                        id="ctx-ceiling"
                        type="number"
                        min={8000}
                        step={1000}
                        value={compactionSettings.ceilingTokens}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v)) setCompactionSettings((s) => sanitizeCompactionSettings({ ...s, ceilingTokens: v }))
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ctx-target">Compact to (tokens)</Label>
                      <Input
                        id="ctx-target"
                        type="number"
                        min={4000}
                        step={1000}
                        value={compactionSettings.compactTargetTokens}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v)) setCompactionSettings((s) => sanitizeCompactionSettings({ ...s, compactTargetTokens: v }))
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ctx-keep">Keep recent messages</Label>
                      <Input
                        id="ctx-keep"
                        type="number"
                        min={2}
                        max={100}
                        value={compactionSettings.keepMessages}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (Number.isFinite(v)) setCompactionSettings((s) => sanitizeCompactionSettings({ ...s, keepMessages: v }))
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Context grows to the ceiling, then the oldest messages fold into the summary and it
                      lands near {formatTokenCount(compactionSettings.compactTargetTokens)} tokens. The newest{" "}
                      {compactionSettings.keepMessages} messages always stay verbatim.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={inFlight}
                      onClick={() => void compactConversation(true)}
                    >
                      {compacting ? "Compacting…" : "Compact now"}
                    </Button>
                  </div>
                  {/* T5.2: live estimate of the next turn's context — system (DM prompt + notes +
                      checkpoints + the rolling summary) plus the budget-fit tail of history. */}
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    ≈ {formatTokenCount(contextEstimate.total)} tokens will go with the next message — the
                    system prompt and summary alone are ≈ {formatTokenCount(contextEstimate.systemTokens)}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:col-span-2">
                  <div className="max-w-60">
                    <Label htmlFor="max-messages">Max Previous Messages</Label>
                    <Input
                      id="max-messages"
                      type="number"
                      value={maxMessages}
                      onChange={(e) => setMaxMessages(Math.min(MAX_PREVIOUS_MESSAGES, Math.max(1, Number.parseInt(e.target.value) || DEFAULT_MAX_MESSAGES)))}
                      min={1}
                      max={MAX_PREVIOUS_MESSAGES}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maximum number of previous messages to include in the context (1-80; only used while
                    auto-compact is off).
                  </p>
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    ≈ {formatTokenCount(contextEstimate.total)} tokens with the latest{" "}
                    {Math.min(maxMessages, messages.length)} message
                    {Math.min(maxMessages, messages.length) === 1 ? "" : "s"} — the system
                    prompt alone is ≈ {formatTokenCount(contextEstimate.systemTokens)}.
                  </p>
                </div>
              )}
            </div>

            {/* Image generation (optional) — TODO.MD #9; expandable section, starts collapsed */}
            <div className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center gap-2 p-3 text-left"
                onClick={() => setImageSettingsOpen((open) => !open)}
                aria-expanded={imageSettingsOpen}
              >
                {imageSettingsOpen ? (
                  <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">Image generation (optional)</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
                    imageApiUrl.trim()
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {imageApiUrl.trim() ? "On" : "Off"}
                </span>
              </button>
              {imageSettingsOpen && (
                <div className="space-y-3 border-t p-3">
                  <p className="text-xs text-muted-foreground">
                    Ask the Dungeon Master to depict major scenes and character introductions.
                    Leave the endpoint URL blank to turn this off entirely.
                  </p>
                  {imageFootprint !== null && (
                    <p className="text-xs text-muted-foreground">
                      {imageFootprint.count > 0
                        ? `${imageFootprint.count} scene${imageFootprint.count === 1 ? "" : "s"} · ${formatBytes(
                            imageFootprint.bytes,
                          )} stored`
                        : "No scene images stored yet."}
                    </p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="image-api-url">Image endpoint</Label>
                    <Input
                      id="image-api-url"
                      value={imageApiUrl}
                      onChange={(e) => setImageApiUrl(e.target.value)}
                      placeholder="e.g. https://api.openai.com/v1/images/generations"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image-api-key">Image API key (optional)</Label>
                    <Input
                      id="image-api-key"
                      type="password"
                      value={imageApiKey}
                      onChange={(e) => setImageApiKey(e.target.value)}
                      placeholder="Only if the image endpoint uses a different key — the chat key is used otherwise"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="image-model">Image model (optional)</Label>
                    <Input
                      id="image-model"
                      value={imageModel}
                      onChange={(e) => setImageModel(e.target.value)}
                      placeholder="e.g. gpt-image-1, flux-1-schnell — leave blank for the provider default"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="image-rate">Min messages between images</Label>
                      <Input
                        id="image-rate"
                        type="number"
                        value={imageRate}
                        onChange={(e) => setImageRate(clampImageRate(Number.parseInt(e.target.value)))}
                        min={MIN_IMAGE_RATE}
                        max={MAX_IMAGE_RATE}
                      />
                      <p className="text-xs text-muted-foreground">
                        At least this many messages must pass between image requests (1-{MAX_IMAGE_RATE}).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="image-size">Image size</Label>
                      <Input
                        id="image-size"
                        value={imageSize}
                        onChange={(e) => setImageSize(e.target.value)}
                        placeholder="1280x720"
                        title="Fixed render size (width x height) — e.g. 1280x720, 1024x1024, 1536x1024"
                      />
                      <p className="text-xs text-muted-foreground">Requested render size; 720p (1280x720) is a good default.</p>
                    </div>
                  </div>
                </div>
              )}
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
        className="flex-1 min-h-0 overflow-y-auto p-4"
        ref={chatContentRef}
      >
        <MessageList
          messages={messages}
          showThinking={isLoading && !turnHasContent}
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
          checkpoints={campaignCheckpoints}
        />
      </CardContent>
      <CardFooter className="border-t p-3">
        <form onSubmit={handleSubmit} className="flex w-full items-end gap-2">
          {/*
            T2.1: multiline composer — players write sentences and paragraphs, not
            one-liners. Auto-grows from 1 line to 6, then scrolls inside (the `rows`
            attribute caps the height; native textarea overflow handles the rest).
            Enter sends; Shift+Enter is a newline (kept explicit in the placeholder).
          */}
          <Textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSubmit(e)
              }
            }}
            rows={Math.min(6, Math.max(1, input === "" ? 1 : input.split("\n").length))}
            placeholder="Type your message…  (Shift+Enter for a new line)"
            disabled={inFlight}
            className="flex-1 min-w-0 text-sm"
          />
          {isLoading || regeneratingId !== null ? (
            // TODO.MD #3.3: while a turn is running, Send becomes Stop.
            // Mobile (below sm): icon-only — the label + its margin eat real
            // width at phone scale, and the icon is self-explanatory.
            <Button type="button" variant="destructive" size="sm" onClick={handleStop} aria-label="Stop generating">
              <SquareIcon className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Stop</span>
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim() || inFlight} size="sm" aria-label="Send message">
              <SendIcon className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Send</span>
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
  )
}
