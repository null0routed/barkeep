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
            Your all-in-one tool for managing D&D character sheets with DM assistance
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
                Before you can use the AI chat features, you’ll need to set up your API connection:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-4">
                <li>
                  Click the <span className="font-mono bg-muted px-1 rounded">⚙️</span> icon in the AI Chat section
                </li>
                <li>Enter your OpenAI API key or the API key for your preferred AI service</li>
                <li>Verify the API URL is correct (default is OpenAI’s endpoint)</li>
                <li>Select your preferred model (e.g., gpt-4o-mini, gpt-3.5-turbo)</li>
                <li>Add a custom system prompt (optional) to replace the built-in one</li>
                <li>
                  Optionally expand <span className="font-mono text-xs">Image generation (optional)</span> in the
                  same settings dialog to let the DM paint major moments as scene images (see the AI Chat tab)
                </li>
              </ol>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">Saving Your Work</h3>
              <p className="mb-2">
                Barkeep saves your work automatically — there is no manual “save” step in normal use:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  <strong>Autosave:</strong> your character, chat history, and settings are saved to your
                  browser’s local storage shortly after each change, and flushed immediately when you close the
                  tab or navigate away
                </li>
                <li>
                  <strong>Save Now:</strong> use the <span className="font-mono bg-muted px-1 rounded">⋯</span>{" "}
                  menu in the header → <span className="font-mono text-xs">Save now</span> to persist
                  immediately
                </li>
                <li>
                  <strong>Export to File:</strong> click the <span className="font-mono bg-muted px-1 rounded">Export</span>{" "}
                  button to download a JSON save file with all your data — if an API key is set, you can choose
                  whether to include it
                </li>
                <li>
                  <strong>Import from File:</strong> use the <span className="font-mono bg-muted px-1 rounded">⋯</span>{" "}
                  menu → <span className="font-mono text-xs">Load from file…</span> to restore a previously
                  exported save
                </li>
                <li>
                  <strong>Storage budget:</strong> browser storage is finite — if you approach its limit, Barkeep
                  shows a banner and prunes the oldest chat history first so saving keeps working, and suggests
                  exporting a save file to keep everything
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
                  <strong>Ability Scores:</strong> Set your character’s six core abilities
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
              <h3 className="font-bold text-lg mb-2">DM Integration</h3>
              <p className="mb-2">
                The sheet and the chat work together: as new items enter the story, the DM quietly captures them
                for you — and when you add an item, the DM helps fill in its entry:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Weapons, armor, and magic items the DM describes are captured automatically in the
                  background — the capture text itself is never shown in the chat
                </li>
                <li>Add the item with <span className="font-mono text-xs">+ Add Item</span> and type its name (e.g.,
                  “Mithral Chainmail”)</li>
                <li>
                  Click <span className="font-mono text-xs">Generate Details</span> — if the DM described that item,
                  Barkeep seeds the description from the story; otherwise it falls back to your recent chat
                </li>
                <li>Review or edit the generated description and rarity, then save it to your sheet</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div>
              <h3 className="font-bold text-lg mb-2">Using the AI Chat</h3>
              <p className="mb-2">The AI chat is pre-configured as a D&D Dungeon Master, but can be customized:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Type messages to talk with the DM</li>
                <li>The built-in prompt runs the chat as a D&amp;D Dungeon Master</li>
                <li>Optionally add a custom system prompt in the AI chat settings to replace it</li>
                <li>
                  Long sessions auto-compact: once the context nears its ceiling, the oldest messages fold into a
                  running summary (and a checkpoint) instead of dropping — so story context survives. The newest
                  messages always stay verbatim, and you can trigger a{" "}
                  <span className="font-mono text-xs">Compact now</span> from the AI chat settings
                </li>
                <li>Chat history is saved along with your character sheet</li>
                <li>
                  If image generation is enabled, the DM may paint major moments as scene images — see{" "}
                  <span className="font-mono text-xs">Scene images</span> below
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-lg mb-2">Scene images</h3>
              <p className="mb-2">
                An optional companion to the chat: the DM can generate an image for major moments (arriving
                somewhere new, meeting an important character). Enable it in the AI chat settings by expanding{" "}
                <span className="font-mono text-xs">Image generation (optional)</span> and pointing it at an image
                API:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Left blank, the feature is off — no image tool, no cost. The DM is instructed to use it sparingly
                  and Barkeep rate-limits it by a configurable window
                </li>
                <li>
                  Generated scenes are stored in your browser (IndexedDB) alongside the chat — they load from local
                  storage, not re-downloaded from the image service
                </li>
                <li>
                  Click a scene thumbnail to view it full-size; press{" "}
                  <span className="font-mono text-xs">Esc</span> or the ✕ to close
                </li>
                <li>
                  The same settings section shows how much space your stored scenes take (count and size); clearing
                  the chat also removes their images
                </li>
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
                <li>Some local servers don’t require an API key</li>
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
