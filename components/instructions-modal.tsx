"use client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface InstructionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function InstructionsModal({ open, onOpenChange }: InstructionsModalProps) {
  const handleGotIt = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to Barkeep - D&D Character Sheet & AI DM</DialogTitle>
          <DialogDescription>
            Your all-in-one tool for managing D&D character sheets with AI assistance
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="setup">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="setup">Initial Setup</TabsTrigger>
            <TabsTrigger value="character">Character Sheet</TabsTrigger>
            <TabsTrigger value="ai">AI Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4">
            <div>
              <h3 className="font-bold text-lg mb-2">Getting Started</h3>
              <p className="mb-2">
                Before you can use the AI chat features, you'll need to set up your API connection:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>
                  Click the <span className="font-mono bg-muted px-1 rounded">⚙️</span> icon in the AI Chat section
                </li>
                <li>Enter your OpenAI API key or the API key for your preferred AI service</li>
                <li>Verify the API URL is correct (default is OpenAI's endpoint)</li>
                <li>Select your preferred model (e.g., gpt-4o-mini, gpt-3.5-turbo)</li>
                <li>Customize the system prompt if desired</li>
              </ol>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">Saving Your Work</h3>
              <p className="mb-2">Barkeep offers multiple ways to save your character and chat history:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Local Storage:</strong> Click the <span className="font-mono bg-muted px-1 rounded">💾</span>{" "}
                  icon to save to your browser's local storage
                </li>
                <li>
                  <strong>Export to File:</strong> Click the <span className="font-mono">Export</span> button to
                  download a JSON file with all your data
                </li>
                <li>
                  <strong>Import from File:</strong> Click the{" "}
                  <span className="font-mono bg-muted px-1 rounded">📤</span> icon to load a previously exported file
                </li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="character" className="space-y-4">
            <div>
              <h3 className="font-bold text-lg mb-2">Character Sheet Features</h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Basic Information:</strong> Name, class, race, level, and background
                </li>
                <li>
                  <strong>Ability Scores:</strong> Set your character's six core abilities
                </li>
                <li>
                  <strong>Inventory & Equipment:</strong> Track items with quantities, descriptions, and rarity
                </li>
                <li>
                  <strong>Proficiencies:</strong> Add armor, weapon, tool, and language proficiencies
                </li>
                <li>
                  <strong>Skills:</strong> Set proficiency and expertise for all standard skills
                </li>
                <li>
                  <strong>Traits & Feats:</strong> Document character traits and special abilities
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">AI Integration</h3>
              <p className="mb-2">You can pull information directly from the AI chat into your character sheet:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>When adding inventory items, equipment, traits, or feats, toggle "Pull from chat"</li>
                <li>Select an AI message containing relevant information</li>
                <li>The system will attempt to extract details automatically</li>
                <li>You can edit the extracted information before adding it to your sheet</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div>
              <h3 className="font-bold text-lg mb-2">Using the AI Chat</h3>
              <p className="mb-2">The AI chat is pre-configured as a D&D Dungeon Master, but can be customized:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Type messages to interact with the AI assistant</li>
                <li>The default system prompt sets up the AI as a D&D Dungeon Master</li>
                <li>You can modify the system prompt to change the AI's behavior</li>
                <li>Chat history is saved along with your character sheet</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">Local AI Models</h3>
              <p className="mb-2">You can connect to locally-hosted AI models:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Change the API URL to your local endpoint (e.g.,{" "}
                  <span className="font-mono text-xs">http://localhost:1234/v1/chat/completions</span>)
                </li>
                <li>Enter the appropriate model name for your local setup</li>
                <li>Some local servers don't require an API key</li>
                <li>Compatible with Ollama, LM Studio, and other OpenAI-compatible APIs</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-4">
          <Button onClick={handleGotIt}>Got it!</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
