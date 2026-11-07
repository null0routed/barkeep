#OPEN TASKS:#

1. ~~Verify maximum characters in the campaign notes (>15K characters allowed). This is due to the restriction of 5MB for localStorage provider in a browser.~~ — done in ad74723

2. ~~Add red accenting to the export warning dialog.~~ — done in 30d9ef9

3. ~~Fix the actions for the chat bubbles:~~ — done in 7514eb5…8eb7522 (3.1–3.6, hashes on each child below)
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

9. ~~AI image generation to help tell the story / set the scene:~~ — done in 6925560 (settings wiring + header badge in 5098f40)
	9.1. ~~Optional AI chat setting for an image generation endpoint (unset = feature off).~~
	9.2. ~~A tool call for the AI to request an image for a provided scene/description, rendered in the chat.~~
	9.3. ~~Rate limiting for image generation — only on major scene and character introductions (one every x messages?).~~

10. ~~Replace the built-in default DM prompt with the owner's updated version (the .MD file in my downloads folder — I'll provide the directory, or paste the content in).~~ — done in 18be3ba

11. ~~All the chat bubble delete icons should show a red outline/stroke (wireframe) on hover — visual cue that delete is the destructive action.~~ — done in 827a0eb (applies to all delete icons: chat + character tabs; was implemented but never struck)

12. ~~CI/CD pipeline: deployment to the webserver (CI already runs the gates — this adds the deploy step; target server + method + triggers TBD).~~ — Design A (hosted-runner + Cloudflare Access SSH + 3 forced-command keys) done in 106adf4…d36401e; Deploy + Rollback both proven end-to-end (see FIXES.MD § 2026-11-03 close-out)

13. ~~Markdown in all of the tab text boxes (inventory, equipment, spells, etc) including newline rendering.~~ — done in eaba466

14. ~~Stat blocks:~~ — done in eaba466
 - ~~Speed~~
 - ~~Spell Attack~~
 - ~~Spell Save~~

15. ~~Search function should also search the "rarity" bubbles.~~ — done in eaba466 (search also extended to spell schools)

16. A dice rolling mechanism.

17. Drag and reorder panels in inventory, equipment, proficiencies, traits and feats. Drag and redorder panels in spells *within their class*.

18. ~~Do I need a slider to adjust font size?~~ — Will not implement (no real use case; everything is rem-based, so the lever can still be added cheaply later if a need surfaces)

19. ~~Insert icons in front of "Export" on main page and then the menu options in the menu.~~ — done in eaba466

20. "Feat" and "Trait" have a "Pull from chat" toggle - how do we clean this up?

21. A tactical map - just an plane with grids/grid coordinates showing dots for where everyone is so that player and DM can get a sense of positioning and use ranged tools better. DM can add obstacles and walls possibly?

22. (maybe) Inline code in chat renders as a full-width block. react-markdown v9+ removed the `inline` prop on the `code` component, so the inline-vs-block check in `components/markdown-body.tsx` never fires and inline `code` spans fall through to the block `<pre>` styling. If we ever want true inline `code` in bubbles, detect inline-ness some other way (e.g. checking the parent `pre` node). Confirmed quirk as of the #13 refactor; low urgency unless it actually bothers us. 

23. I need to add something to the system prompt that specifies how the AI will call itself "Barkeep", adopt that persona, etc.
