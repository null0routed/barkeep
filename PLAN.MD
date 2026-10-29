# Barkeep — Implementation Plan: TODO.MD #3.2–#3.6 (chat bubble actions + streaming)

Date: 2026-10-28
Scope: TODO.MD items 3.2 (edit), 3.3 (stop), 3.4 (stats), 3.5 (thinking), 3.6 (streaming).
3.1 (action overlap) is already done (commit `7514eb5`).

## Owner decisions (confirmed 2026-10-28)

1. **Tooltip (3.4):** NEW DEPENDENCY APPROVED — `@radix-ui/react-tooltip` + shadcn
   `components/ui/tooltip.tsx`.
2. **Edit (3.2):** resubmit the **whole conversation** (edited message in place, tail
   preserved, in natural order); the new assistant reply is **appended at the end**.
3. **Streaming (3.6):** **auto-detect with fallback** — try `stream: true`; if the
   endpoint answers with plain JSON (content-type is not `text/event-stream`), read
   that response as the non-streamed body. No settings toggle.
4. **Stats scope (3.4):** per assistant message (each turn carries its own stats).
5. TODO.MD gets a strike-through + "complete" mark **only after the owner manually
   validates** each item.

## Architecture notes (shared by all items)

- **Turn model.** `callApi` changes from `async (userContent, context) => string` to
  `async (conversation: ChatMessage[], onDelta?) => AssistantTurn`, where
  `conversation` is the full ordered history for the turn and
  `AssistantTurn = { content: string; thinking?: string; stats: TurnStats }`
  (defined in `lib/chat-turn.ts`). Call sites:
  - send → `[...recentMessages, newUserMessage]` (append a new bubble)
  - regenerate → `[...beforeTheUserTurn, userMessage]` (update that assistant bubble in place)
  - edit → the whole edited conversation (append a new bubble)
- **In-flight bubble.** One shared `runAssistant(conversation, bubbleId?)` helper
  creates the assistant bubble (stable `crypto.randomUUID()`) up front and upserts it
  by id: per-delta during streaming, final `{content, thinking, stats}` at the end.
  Streaming and non-streaming paths are therefore identical to callers.
- **Data model (additive, backward-compatible).** `lib/types.ts`:
  - `TurnStats { promptTokens?; completionTokens?; totalTokens?; contextMessages;
    elapsedMs; tokensPerSecond?; aborted? }`
  - `ChatMessage.thinking?: string`, `ChatMessage.stats?: TurnStats`
  Old localStorage saves simply lack the fields → no info icon, no thinking section;
  no migration, import path unaffected.
- **Pure helpers in `lib/` (unit-tested, node:test + tsx):**
  - `lib/chat-turn.ts` — `extractThinking` (structured `reasoning` /
    `reasoning_content` fields), `mergeUsage` (sums across the two tool-path legs),
    `buildStats` (usage + timing → TurnStats), `toAssistantTurn`, `isAbortError`,
    `statsLines` (tooltip rows).
  - `lib/thinking.ts` — `splitThinkTags` (extracted from markdown-renderer).
  - `lib/stream.ts` — `parseDataLine`, `iterateStream` (SSE reader),
    `NonStreamableError`.
- **Abort (3.3):** one `AbortController` per in-flight turn in an `abortRef`; both
  fetch legs pass it as `signal`; `Stop` button replaces Send while a turn runs;
  `AbortError` → `toast.info("Stopped.")`, partial streamed content stays rendered.
- **Gates after every phase** (FIXES.MD convention): `npm run lint` 0 findings,
  `npx tsc --noEmit` 0 errors, `npm test` all pass, `npm run build` green
  (static export, bundle size noted).

## Phases (execution order)

- [x] **A — Foundation (3.4/3.5 data path).** `TurnStats` + `ChatMessage` extensions;
  `lib/chat-turn.ts` + tests; `callApi` refactored to
  `(conversation, onDelta?) => AssistantTurn` (non-streamed yet); `runAssistant`;
  send/regenerate rewired. No visible UI change.
- [ ] **B — Stop (3.3).** `abortRef` + `signal` on all fetches; Stop button in the
  input row; `AbortError` handling in send/regenerate/edit.
- [ ] **C — Edit (3.2).** `Pencil` action on user bubbles → inline editor
  (Textarea + Save & resend / Cancel); on save: replace the message in place,
  resubmit the whole edited conversation, append the new reply. Disabled while a
  turn is in flight.
- [ ] **D — Stats tooltip (3.4).** `@radix-ui/react-tooltip` + `ui/tooltip.tsx`;
  `Info` action on assistant bubbles that have `stats`, showing Context / Tokens in /
  Tokens out / Total / Speed / Duration (+ "stopped by user" when applicable);
  `TooltipProvider` around the chat area.
- [ ] **E — Thinking (3.5).** `splitThinkTags` extracted to `lib/thinking.ts` with
  tests; `MarkdownRenderer` gains a `thinking` prop rendered as a collapsed
  `ThinkBlock` above the content when the model provided it (hidden otherwise);
  structured-field capture lands from Phase A.
- [ ] **F — Streaming (3.6).** `lib/stream.ts` + tests; `callApi` attempts
  `stream: true`, reads SSE deltas into the in-flight bubble via `onDelta`, falls
  back to plain-JSON handling when content-type is not `text/event-stream`;
  tool-call deltas accumulate and take the existing second leg; stats capture usage
  from final chunk(s); Stop works mid-stream (partial kept).

## Definition of done

- All five items work against an OpenAI-compatible endpoint (streaming and
  non-streaming), with Stop and Edit usable in flight.
- Gates green on each phase; full gate set green at the end.
- Owner manually validates each TODO item → then the item is struck through in
  TODO.MD and marked complete (separate commit).
