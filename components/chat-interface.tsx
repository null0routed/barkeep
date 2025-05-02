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
import CampaignSummaryComponent from "./campaign-summary"

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
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdatingSummary, setIsUpdatingSummary] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [maxMessages, setMaxMessages] = useState(MAX_PREVIOUS_MESSAGES)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate and set the chat height based on window size
  const updateChatHeight = () => {
    if (containerRef.current) {
      const windowHeight = window.innerHeight
      const containerTop = containerRef.current.getBoundingClientRect().top
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
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

      // Prepare the messages for the API with campaign summary
      const apiMessages = [
        {
          role: "system",
          content:
            `${systemPrompt}\n\n` +
            `CAMPAIGN SUMMARY:\n` +
            `Recent Events: ${campaignSummary.conversationSummary || "This is a new conversation."}\n\n` +
            `Plot Points: ${campaignSummary.plotPoints || "None"}\n` +
            `NPCs: ${campaignSummary.npcs || "None"}\n` +
            `Locations: ${campaignSummary.locations || "None"}\n` +
            `Quests: ${campaignSummary.quests || "None"}`,
        },
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

      // Update the campaign summary after receiving a response
      await updateCampaignSummary([...messages, userMessage, assistantMessage])
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

  const updateCampaignSummary = async (messageHistory: ChatMessage[]) => {
    if (!apiKey || !apiUrl) return

    setIsUpdatingSummary(true)

    try {
      // Get the most recent messages for context
      const recentMessages = messageHistory.slice(-15)

      // Create a prompt to update the campaign summary
      const updatePrompt = `
        Based on the following conversation between a player and a DM, please update the campaign summary.
        Extract key information and provide concise updates for each section.
        
        CONVERSATION:
        ${recentMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n\n")}
        
        CURRENT CAMPAIGN SUMMARY:
        Conversation Summary: ${campaignSummary.conversationSummary || "This is a new conversation."}
        Plot Points: ${campaignSummary.plotPoints || "None"}
        NPCs: ${campaignSummary.npcs || "None"}
        Locations: ${campaignSummary.locations || "None"}
        Quests: ${campaignSummary.quests || "None"}
        
        Please provide an updated campaign summary in the following format:
        
        CONVERSATION SUMMARY:
        [A concise summary (max 200 words) of the recent conversation and key developments]
        
        PLOT POINTS:
        [Updated plot points]
        
        NPCS:
        [Updated NPCs with brief descriptions]
        
        LOCATIONS:
        [Updated locations with brief descriptions]
        
        QUESTS:
        [Updated active and completed quests]
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
            { role: "system", content: "You are a helpful assistant that organizes D&D campaign information." },
            { role: "user", content: updatePrompt },
          ],
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices[0].message.content.trim()

      // Parse the response to extract the updated summary
      const conversationMatch = content.match(/CONVERSATION SUMMARY:\s*([\s\S]*?)(?=\s*PLOT POINTS:|$)/i)
      const plotPointsMatch = content.match(/PLOT POINTS:\s*([\s\S]*?)(?=\s*NPCS:|$)/i)
      const npcsMatch = content.match(/NPCS:\s*([\s\S]*?)(?=\s*LOCATIONS:|$)/i)
      const locationsMatch = content.match(/LOCATIONS:\s*([\s\S]*?)(?=\s*QUESTS:|$)/i)
      const questsMatch = content.match(/QUESTS:\s*([\s\S]*?)(?=$)/i)

      // Update the campaign summary
      setCampaignSummary({
        conversationSummary: conversationMatch ? conversationMatch[1].trim() : campaignSummary.conversationSummary,
        plotPoints: plotPointsMatch ? plotPointsMatch[1].trim() : campaignSummary.plotPoints,
        npcs: npcsMatch ? npcsMatch[1].trim() : campaignSummary.npcs,
        locations: locationsMatch ? locationsMatch[1].trim() : campaignSummary.locations,
        quests: questsMatch ? questsMatch[1].trim() : campaignSummary.quests,
        lastUpdated: new Date().toLocaleString(),
      })
    } catch (error) {
      console.error("Error updating campaign summary:", error)
    } finally {
      setIsUpdatingSummary(false)
    }
  }

  const handleGenerateUpdate = async () => {
    await updateCampaignSummary(messages)
  }

  const handleClearChat = () => {
    setMessages([])
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
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <CampaignSummaryComponent
        summary={campaignSummary}
        onUpdate={setCampaignSummary}
        onGenerateUpdate={handleGenerateUpdate}
        isUpdating={isUpdatingSummary}
      />

      <Card className="flex flex-col w-full" style={{ height: `${chatHeight}px` }}>
        <CardContent className="flex-1 overflow-y-auto p-4" style={{ height: `calc(${chatHeight}px - 56px)` }}>
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
