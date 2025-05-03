"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ChatMessage, CampaignSummary } from "@/lib/types"
import { SendIcon, SettingsIcon, TrashIcon } from "lucide-react"
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
}

// Maximum number of previous messages to include in the context
const MAX_PREVIOUS_MESSAGES = 6

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
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdatingSummary, setIsUpdatingSummary] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [headerSummary, setHeaderSummary] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)

  // Calculate and set the chat height based on window size
  const updateChatHeight = () => {
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
  }

  // Update height on mount and window resize
  useEffect(() => {
    updateChatHeight()
    window.addEventListener("resize", updateChatHeight)
    return () => window.removeEventListener("resize", updateChatHeight)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Update header summary when messages change
  useEffect(() => {
    if (messages.length > 0) {
      updateHeaderSummary(messages)
    }
  }, [messages])

  const scrollToBottom = () => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight
    }
  }

  const updateHeaderSummary = async (messageHistory: ChatMessage[]) => {
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
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Prepare the system message with the header summary
      const systemMessage = {
        role: "system",
        content: `${systemPrompt}\n\n${
          headerSummary ? `CONVERSATION CONTEXT:\n${headerSummary}\n\n` : ""
        }Please keep this context in mind when responding.`,
      }

      // Prepare the messages for the API
      const apiMessages = [
        systemMessage,
        ...recentMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        { role: "user", content: input },
      ]

      // Call the OpenAI-compatible API
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: apiMessages,
          stream: false,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.choices[0].message.content,
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
    }
  }

  const handleClearChat = () => {
    setMessages([])
    setHeaderSummary("")
    setIsAlertOpen(false)
  }

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
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No messages yet. Start a conversation with your AI assistant!
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg p-3 text-sm ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {message.role === "assistant" ? <MarkdownRenderer content={message.content} /> : message.content}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg p-3 bg-muted animate-pulse text-sm">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
        <CardFooter className="border-t p-3 h-[56px]">
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 text-sm"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="sm">
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
