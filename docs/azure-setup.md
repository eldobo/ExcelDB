# Azure App Registration Setup

ExcelDB authenticates users via Microsoft OAuth to access their OneDrive files. This requires an Azure app registration, which acts as the OAuth client. There is no server to deploy — the registration just gives you a client ID that MSAL.js uses for the browser-based auth flow.

## Prerequisites

- A Microsoft account (personal — outlook.com, hotmail.com, live.com, etc.)
- Access to the [Azure Portal](https://portal.azure.com) (free with any Microsoft account)

## Step-by-step

### 1. Go to App registrations

Navigate to [Azure Portal > App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).

Sign in with your Microsoft account if prompted.

### 2. Create a new registration

Click **+ New registration** and fill in:

| Field | Value |
|-------|-------|
| **Name** | Whatever you like (e.g., "Health Journal", "My ExcelDB App") |
| **Supported account types** | Select **Personal Microsoft accounts only** |
| **Redirect URI** | Platform: **Single-page application (SPA)**. URI: `http://localhost:5173` |

Click **Register**.

### 3. Note the client ID

After registration, you'll see the **Overview** page. Copy the **Application (client) ID** — this is the value you pass to `createAuth({ clientId: '...' })`.

It looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

### 4. Add API permissions

Go to **API permissions** in the left sidebar.

Click **+ Add a permission** > **Microsoft Graph** > **Delegated permissions**.

Add these two permissions:

| Permission | Description |
|------------|-------------|
| `Files.ReadWrite` | Read and write the user's OneDrive files |
| `User.Read` | Read the user's basic profile (usually pre-added) |

You do NOT need to click "Grant admin consent" — these permissions work with user consent on personal accounts.

### 5. Verify redirect URI

Go to **Authentication** in the left sidebar.

Under **Single-page application**, verify your redirect URI is listed:
- `http://localhost:5173` (Vite dev server)

Add additional redirect URIs for production later:
- Your production web URL (e.g., `https://myapp.example.com`)
- Capacitor on iOS: `capacitor://localhost` (or your configured scheme)
- Tauri on desktop: `tauri://localhost` (or your configured scheme)

### 6. No client secret needed

SPA apps use Authorization Code Flow with PKCE, which does not require a client secret. Do NOT create a secret — it cannot be stored securely in a browser.

## Using the client ID

```typescript
import { createAuth, connect } from 'exceldb';

const auth = createAuth({
  clientId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  // authority defaults to personal accounts
  // redirectUri defaults to window.location.origin
});

const db = await connect({
  auth,
  fileName: 'health_journal.xlsx',
  schema: mySchema,
});
```

## What happens when users sign in

1. The first time a user opens your app, they see a Microsoft login popup
2. After signing in, they see a consent screen: "This app wants to access your files"
3. They click "Accept"
4. The token is cached in the browser — subsequent visits sign in silently (no popup)
5. The consent is remembered by Microsoft — users only see it once per app registration

## Troubleshooting

### "AADSTS50011: The redirect URI does not match"

The redirect URI in the Azure app registration must exactly match the one used at runtime. Check:
- Protocol: `http` vs `https` (localhost is `http`, production is `https`)
- Port: `5173` for Vite dev, your production URL for deployed
- Trailing slash: must match exactly

### "AADSTS65001: The user or administrator has not consented"

The user needs to re-consent. This can happen if you changed the required permissions after the user first consented. Call `auth.login()` to trigger a new consent prompt.

### "AADSTS700054: response_type 'code' is not enabled"

The redirect URI is configured as "Web" instead of "Single-page application" in Azure. Go to Authentication and move the URI to the SPA section.

## Security notes

- The client ID is public — it's embedded in your app's JavaScript. This is by design for SPA/public clients.
- The access token is stored in browser `sessionStorage` (cleared when the tab closes). Use `localStorage` for persistence across sessions (configurable in MSAL).
- The token only grants access to the scopes the user consented to (`Files.ReadWrite`). It cannot access email, calendar, contacts, or other data.
- Users can revoke access at any time via [Microsoft account security settings](https://account.microsoft.com/privacy/app-access).
