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

    ## Business communication and radar

    Digital Baki Khata stores a customer's WhatsApp number and opens a
    pre-filled reminder through `wa.me` with the current outstanding amount.
    German Homeo Hall records can open a pre-filled prescription/notes message to
    the doctor at `01912420827`. WhatsApp still requires the merchant to review
    and tap Send.

    Business Radar uses dated sales, purchase, stock, finance, customer and order
    records. It estimates 30/90/365-day demand and applies a bounded seasonal
    demand factor when enough month-based sales history exists. It is a
    record-based estimate, not a market forecast or automatic ordering system.

    The app also exposes `manifest.webmanifest`, `sw.js`, and `icon.svg` so a
    deployed HTTPS version can be installed as a standalone PWA from a compatible
    mobile browser.

    ## Existing integrations
    Firebase Authentication, Firestore, and Storage remain initialized from the
    existing Firebase configuration in `index.html`. Business data continues to
    use the app's existing local-storage and Firebase sync paths.
    