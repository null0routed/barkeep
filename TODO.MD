#OPEN TASKS:#

1. ~~Verify maximum characters in the campaign notes (>15K characters allowed). This is due to the restriction of 5MB for localStorage provider in a browser.~~ — done in ad74723

2. ~~Add red accenting to the export warning dialog.~~ — done in 30d9ef9

3. Fix the actions for the chat bubbles:
	3.1. ~~'Delete' bubble appears over the text.~~ — done in 7514eb5
	3.2. ~~No 'retry' or 'edit' actions. Edit should allow the text to be modified then resubmit the whole chat.~~ — done in 93338eb
	3.3. ~~No 'stop' action for a submitted chat.~~ — done in 8bea63e
	3.4. ~~No 'information' icon with a tooltip that shows stats (total context, tokens/s, tokens in, tokens out, etc).~~ — done in 6905bd3
	3.5. ~~Verify that 'thinking' renders in an expandable section inside the bubble which starts collapsed. If the model doesn't provide thinking, don't show it.~~ — done in 5bc8f00
	3.6. ~~If the AI model or router supports streaming, stream the content into the bubble as it is returned.~~ — done in 8eb7522

4. ~~Check the "generate details" tool/function inside of the "Add Item" dialog/modal.~~ — done in 9cff453

5. ~~Update the versions of all components (React/NodeJS) in the app to latest - without breaking functionality.~~ — Phase E done in 4d02cba…00df283 (E1–E7: Node 24 · ESLint 10 · Next 16 · React 19.3 · Radix/lucide/sonner/tailwind-merge current · Tailwind 4.3 · TS 6.0.3 pinned — TS7 deferred via ecosystem; log in FIXES.MD)

6. ~~'npm run build' shows several warnings - can we fix these?~~ — done in a90b566

7. ~~My system prompt should be injected for the AI API call, but not rendered in the chat settings dialog. A user can add their own and the app will preference that one, but mine should not render there.~~ — done in ac1d053

8. ~~The 'Generate Details' button in Inventory and Equipment doesn\'t prompt handle the task correctly. The intent is that if a piece of equipment or an item if found and mentioned in chat, the 'Generate Details' button pulls the correct details for that specific item. The model may not have context after the fact with the 'Generate Item' button. How do we tackle this? Do we add some sort of prompt requirement that any equipment or item mentioned in the chat (e.g. loot) automatically has core details attached to the chat response? What are other options here?~~ — done in 7657e25 (capture in 52c5aed)
