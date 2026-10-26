#OPEN TASKS:#

1. Verify maximum characters in the campaign notes (>15K characters allowed). This is due to the restriction of 5MB for localStorage provider in a browser.

2. Add red accenting to the export warning dialog.

3. Fix the actions for the chat bubbles:
	3.1. 'Delete' bubble appears over the text.
	3.2. No 'retry' or 'edit' actions. Edit should allow the text to be modified then resubmit the whole chat.
	3.3. No 'stop' action for a submitted chat.
	3.4. No 'information' icon with a tooltip that shows stats (total context, tokens/s, tokens in, tokens out, etc).
	3.5. Verify that 'thinking' renders in an expandable section inside the bubble which starts collapsed. If the model doesn't provide thinking, don\'t show it.
	3.6. If the AI model or router supports streaming, stream the content into the bubble as it is returned.

4. Check the "generate details" tool/function inside of the "Add Item" dialog/modal.

5. Update the versions of all components (React/NodeJS) in the app to latest - without breaking functionality.

6. 'npm run build' shows several warnings - can we fix these?

7. My system prompt should be injected for the AI API call, but not rendered in the chat settings dialog. A user can add their own and the app will preference that one, but mine should not render there.
