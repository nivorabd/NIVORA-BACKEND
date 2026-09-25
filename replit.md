# NIVORA ONE on Replit

## Run

The app uses the existing single-page `index.html` and a dependency-free Node
server:

```bash
npm start
```

The Replit workflow is configured as **Start application** on port 5000.

## AI configuration

Set the `GEMINI_API_KEY` as a Replit Secret. The browser calls the same-origin
`/api/ai-chat` route; the key is read only by the server and is never included
in `index.html` or returned to the browser.

The server sends the prompt, recent conversation history, and NIVORA business
context to Gemini. It uses `gemini-2.5-flash` first and retries with
`gemini-3.6-flash` only when Gemini reports that the requested model has been
retired for the current API account.

## Existing integrations

Firebase Authentication, Firestore, and Storage remain initialized from the
existing Firebase configuration in `index.html`. Business data continues to
use the app's existing local-storage and Firebase sync paths.