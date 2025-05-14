"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ChatMessage, CampaignSummary, CharacterData } from "@/lib/types"
import { SendIcon, SettingsIcon, TrashIcon, RefreshCwIcon } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
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

interface ChatInterfaceProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  apiUrl: string
  setApiUrl: React.Dispatch<React.SetStateAction<string>>
  apiKey: string
  setApiKey: React.Dispatch<React.SetStateAction<string>>
  model: string
  setModel: React.Dispatch<React.SetStateAction<string>>
  systemPrompt: string
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>
  campaignSummary: CampaignSummary
  setCampaignSummary: React.Dispatch<React.SetStateAction<CampaignSummary>>
  maxMessages: number
  setMaxMessages: React.Dispatch<React.SetStateAction<number>>
  character: CharacterData
}

// Maximum number of previous messages to include in the context
const MAX_PREVIOUS_MESSAGES = 6

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
    const [showControls, setShowControls] = useState(false)

    return (
      <div
        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} relative group`}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        <div
          className={`max-w-[85%] rounded-lg p-3 text-sm ${
            message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {message.role === "assistant" ? <MarkdownRenderer content={message.content} /> : message.content}

          {/* Message controls */}
          {showControls && (
            <div
              className={`absolute ${
                message.role === "user" ? "left-0 -translate-x-full" : "right-0 translate-x-full"
              } top-0 flex gap-1 p-1`}
            >
              {message.role === "assistant" && onRegenerate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRegenerate(message.id)}
                  disabled={isRegenerating}
                  title="Regenerate response"
                >
                  <RefreshCwIcon className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onDelete(message.id)}
                title="Delete message"
              >
                <TrashIcon className="h-3 w-3" />
              </Button>
            </div>
          )}
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
    messagesEndRef: React.RefObject<HTMLDivElement>
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
            <div className="max-w-[85%] rounded-lg p-3 bg-muted animate-pulse text-sm">Thinking...</div>
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
  campaignSummary,
  setCampaignSummary,
  maxMessages,
  setMaxMessages,
  character,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdatingSummary, setIsUpdatingSummary] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [headerSummary, setHeaderSummary] = useState("")
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Update header summary when messages change
  useEffect(() => {
    if (messages.length > 0) {
      updateHeaderSummary(messages)
    }
  }, [messages])

  const scrollToBottom = useCallback(() => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight
    }
  }, [])

  const updateHeaderSummary = useCallback(
    async (messageHistory: ChatMessage[]) => {
      if (!apiKey || !apiUrl || messageHistory.length < 3) {
        // Don't update if there are too few messages
        return
      }

      setIsUpdatingSummary(true)

      try {
        // Get the most recent messages for context
        const recentMessages = messageHistory.slice(-10)

        // Create a prompt to update the header summary
        const updatePrompt = `
          Based on the following conversation between a player and a DM, please create a concise summary (max 150 words) 
          that captures the key context of the conversation so far. This summary will be used as context for future messages.
          
          CONVERSATION:
          ${recentMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")}
          
          Please provide a concise summary that captures the essential context needed to continue this conversation.
        `

        // Call the API to generate updated summary
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: "You are a helpful assistant that summarizes D&D campaign conversations." },
              { role: "user", content: updatePrompt },
            ],
            max_tokens: 300,
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        const content = data.choices[0].message.content.trim()

        // Update the header summary
        setHeaderSummary(content)

        // Also update the campaign summary for compatibility
        setCampaignSummary({
          ...campaignSummary,
          conversationSummary: content,
          lastUpdated: new Date().toLocaleString(),
        })
      } catch (error) {
        console.error("Error updating header summary:", error)
      } finally {
        setIsUpdatingSummary(false)
      }
    },
    [apiKey, apiUrl, model, campaignSummary, setCampaignSummary],
  )

  // Define the character sheet tool
  const characterSheetTool = {
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

  // Function to handle the character sheet tool call
  const handleToolCalls = useCallback(
    (toolCalls: any[]) => {
      const results = []

      for (const toolCall of toolCalls) {
        if (toolCall.function.name === "getCharacterSheet") {
          // Format the character data
          const formattedCharacterData = formatCharacterData(character)
          results.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: "getCharacterSheet",
            content: formattedCharacterData,
          })
        }
      }

      return results
    },
    [character],
  )

  const callApi = useCallback(
    async (userContent: string, contextMessages: ChatMessage[]) => {
      try {
        // Prepare the system message with the header summary and tool instructions
        const toolInstructions = `
You have access to the player's character sheet through a tool. You can access it by calling the getCharacterSheet function.
Use this tool when you need to reference the character's stats, abilities, inventory, or other details.
DO NOT mention that you're using this tool to the player - just incorporate the information naturally in your responses.
`

        const systemMessage = {
          role: "system",
          content: `${systemPrompt}\n\n${
            headerSummary ? `CONVERSATION CONTEXT:\n${headerSummary}\n\n` : ""
          }${toolInstructions}\nPlease keep this context in mind when responding.`,
        }

        // Prepare the messages for the API
        const apiMessages = [
          systemMessage,
          ...contextMessages.map((msg) => ({ role: msg.role, content: msg.content })),
          { role: "user", content: userContent },
        ]

        // Call the OpenAI-compatible API with tools
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: apiMessages,
            tools: [characterSheetTool],
            tool_choice: "auto",
            stream: false,
          }),
        })

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()

        // Check if the response contains tool calls
        if (data.choices[0].message.tool_calls && data.choices[0].message.tool_calls.length > 0) {
          // Handle tool calls
          const toolResults = handleToolCalls(data.choices[0].message.tool_calls)

          // Make a second API call with the tool results
          const secondResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model,
              messages: [...apiMessages, data.choices[0].message, ...toolResults],
              stream: false,
            }),
          })

          if (!secondResponse.ok) {
            throw new Error(`API error in second call: ${secondResponse.status}`)
          }

          const secondData = await secondResponse.json()
          return secondData.choices[0].message.content
        } else {
          return data.choices[0].message.content
        }
      } catch (error) {
        console.error("Error calling API:", error)
        throw error
      }
    },
    [apiKey, apiUrl, model, systemPrompt, headerSummary, characterSheetTool, handleToolCalls],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim()) return

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
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

        const assistantContent = await callApi(input, recentMessages)

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: assistantContent,
        }
        setMessages((prev) => [...prev, assistantMessage])

        // Update the header summary after receiving a response
        // This will happen automatically via the useEffect
      } catch (error) {
        console.error("Error calling API:", error)
        // Add error message
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, there was an error processing your request. Please check your API settings and try again.",
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
        // Focus the input field after sending a message
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }
    },
    [input, messages, maxMessages, setMessages, callApi],
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
        // Get context messages (messages before the user message)
        const contextMessages = messages.slice(0, userIndex)

        // Call the API with the user message and context
        const newContent = await callApi(userMessage.content, contextMessages)

        // Update the assistant message with the new content
        setMessages((prev) => {
          const updated = [...prev]
          updated[assistantIndex] = {
            ...updated[assistantIndex],
            content: newContent,
            id: Date.now().toString(), // Update ID to force re-render
          }
          return updated
        })
      } catch (error) {
        console.error("Error regenerating message:", error)
      } finally {
        setRegeneratingId(null)
      }
    },
    [messages, callApi, setMessages],
  )

  const handleClearChat = useCallback(() => {
    setMessages([])
    setHeaderSummary("")
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
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" title="Chat settings">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Chat Settings</SheetTitle>
                <SheetDescription>Configure your AI chat settings here.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 py-4">
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
                      setMaxMessages(Math.max(1, Number.parseInt(e.target.value) || MAX_PREVIOUS_MESSAGES))
                    }
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of previous messages to include in the context (1-20).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="system-prompt">System Prompt</Label>
                  <Textarea
                    id="system-prompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a helpful assistant..."
                    rows={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="header-summary">Current Header Summary</Label>
                  <Textarea
                    id="header-summary"
                    value={headerSummary}
                    onChange={(e) => setHeaderSummary(e.target.value)}
                    placeholder="No summary generated yet. This will update automatically as you chat."
                    rows={3}
                    className="text-muted-foreground text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    This summary is automatically generated and included with each message to provide context.
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
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
