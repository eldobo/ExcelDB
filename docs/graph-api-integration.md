# Microsoft Graph API Integration

ExcelDB uses the Microsoft Graph API to store and retrieve `.xlsx` files from the user's OneDrive. This document covers which endpoints are used, how authentication works, and how errors are handled.

## Why not the Excel workbook API?

Microsoft Graph provides a rich Excel workbook API at `/workbook/` endpoints — sessions, ranges, tables, named items, and cell-level operations. However, **these endpoints do not support personal OneDrive (consumer) accounts**. They only work with OneDrive for Business (organizational accounts).

Since ExcelDB targets personal Microsoft accounts, we use the OneDrive **file storage API** instead. This API works on both personal and business accounts and provides everything we need: file creation, download, upload, and metadata (including eTag for conflict detection).

Reference: [Microsoft Q&A — Workbook Excel API for personal OneDrive accounts](https://learn.microsoft.com/en-us/answers/questions/1691489/workbook-excel-api-for-personal-onedrive-accounts)

## Authentication

### OAuth 2.0 with PKCE

ExcelDB uses the Authorization Code Flow with PKCE (Proof Key for Code Exchange), which is the recommended flow for single-page applications and native apps. No client secret is required.

**Flow:**
1. App redirects user to Microsoft login page
2. User authenticates and consents to permissions
3. Microsoft redirects back with an authorization code
4. MSAL.js exchanges the code for an access token (using PKCE verifier)
5. Access token is cached in browser storage
6. Token is included in API requests as `Authorization: Bearer {token}`
7. MSAL.js automatically refreshes the token before expiration using a refresh token

**MSAL configuration (via `createAuth()`):**
- Authority: `https://login.microsoftonline.com/consumers` (personal accounts only)
- Response type: `code` (authorization code)
- PKCE: Enabled automatically by MSAL.js
- Token storage: Browser `localStorage`

### Required scopes

| Scope | Why |
|-------|-----|
| `Files.ReadWrite` | Read and write files in the user's OneDrive |
| `User.Read` | Read basic user profile (pre-consented by default) |

These are **delegated** permissions — the app acts on behalf of the signed-in user. No admin consent is required for personal accounts.

### Token lifecycle

- Access tokens expire after ~1 hour
- MSAL.js caches tokens and automatically refreshes them using the refresh token
- `getAccessToken()` returns a valid token (refreshing silently if needed)
- If the refresh token is also expired (e.g., after weeks of inactivity), an interactive login is required
- Graph API returns `401 Unauthorized` if the token is invalid → ExcelDB retries once after re-acquiring a token, then throws `ExcelDBAuthError`

## Endpoints used

All requests go to `https://graph.microsoft.com/v1.0`. Every request includes the `Authorization: Bearer {token}` header.

### Find file by path

```
GET /me/drive/root:/{folderPath}/{fileName}
```

Returns the DriveItem metadata (including `id` and `eTag`) if the file exists. Returns `404` if not found.

Example:
```
GET /me/drive/root:/Apps/HealthJournal/health_journal.xlsx
```

Response (relevant fields):
```json
{
  "id": "ABC123",
  "name": "health_journal.xlsx",
  "eTag": "\"aQNlY2YxYV8...\"",
  "size": 8234,
  "file": { "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
}
```

### Create file (upload new)

```
PUT /me/drive/root:/{folderPath}/{fileName}:/content
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

[binary .xlsx bytes]
```

Creates the file (and any intermediate folders in the path) if it doesn't exist, or overwrites if it does. Returns the DriveItem metadata including the new `eTag`.

For files under 4MB (which ExcelDB files will always be), the simple upload endpoint is sufficient. No need for resumable uploads.

### Download file

```
GET /me/drive/items/{itemId}/content
```

Returns a `302` redirect to the download URL. The Graph client follows the redirect and receives the raw `.xlsx` bytes.

To get the current eTag along with the download, ExcelDB first fetches the item metadata (`GET /me/drive/items/{itemId}`), then downloads the content. This ensures the eTag matches the downloaded content.

### Upload file (update existing)

```
PUT /me/drive/items/{itemId}/content
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
If-Match: "{eTag}"

[binary .xlsx bytes]
```

Replaces the file content. The `If-Match` header ensures the upload only succeeds if the file hasn't been modified since the eTag was obtained.

- **Success (200):** Returns updated DriveItem with new `eTag`
- **Conflict (412 Precondition Failed):** The file was modified by someone else → `ExcelDBConflictError`

### Get item metadata

```
GET /me/drive/items/{itemId}
```

Returns the DriveItem metadata. Used to refresh the eTag without downloading the full file content.

## Error handling

### HTTP status code mapping

| Status | Meaning | ExcelDB behavior |
|--------|---------|-----------------|
| `200` | Success | Process response |
| `201` | Created | Process response (file creation) |
| `302` | Redirect | Follow redirect (file download) |
| `401` | Unauthorized | Re-acquire token, retry once. If still 401 → `ExcelDBAuthError` |
| `404` | Not found | `ExcelDBNotFoundError` (or create file, depending on context) |
| `409` | Conflict | `ExcelDBConflictError` |
| `412` | Precondition failed | `ExcelDBConflictError` (eTag mismatch) |
| `429` | Too many requests | Wait `Retry-After` seconds, then retry once → `ExcelDBError` |
| `500+` | Server error | `ExcelDBError` (no automatic retry) |

### Throttle handling (429)

Microsoft Graph enforces rate limits:
- Excel-specific: 5,000 requests per 10 seconds per app
- Global: 130,000 requests per 10 seconds per app

When throttled, the response includes a `Retry-After` header (value in seconds). ExcelDB waits the specified time (defaulting to 1 second if absent) before retrying once.

For typical ExcelDB usage (a few operations per user interaction), throttling is extremely unlikely. The library makes at most 2-3 Graph API calls per user action (metadata + download + upload).

## ETag-based conflict detection

ETags (entity tags) are opaque strings that identify a specific version of a file. OneDrive returns an eTag with every file operation.

### How ExcelDB uses ETags

1. **On download:** Store the eTag from the DriveItem metadata
2. **On upload:** Send the stored eTag in the `If-Match` header
3. **If the file changed:** The server returns `412 Precondition Failed` because the eTag no longer matches
4. **ExcelDB surfaces this as:** `ExcelDBConflictError`

### Conflict scenarios

| Scenario | What happens |
|----------|-------------|
| User edits file in Excel while app is writing | Upload returns 412 → `ExcelDBConflictError` |
| User edits file between app reads | Not detected until next write. Read serves from cache. Call `db.refresh()` to re-download. |
| Two browser tabs writing simultaneously | First upload succeeds, second gets 412 |
| App writes, user reads in Excel | No conflict — user sees the updated file |

### Handling conflicts in consuming apps

```typescript
try {
  await symptoms.append({ /* ... */ });
} catch (error) {
  if (error instanceof ExcelDBConflictError) {
    // File was modified externally. Re-download and retry.
    await db.refresh();
    await symptoms.append({ /* ... */ });
  }
}
```

ExcelDB does NOT attempt automatic merge. The consuming app decides how to resolve conflicts. For a personal health journal, the simplest strategy is: refresh and retry.

## Request patterns

### Connect (first run — file doesn't exist)

```
1. GET  /me/drive/root:/Apps/HealthJournal/health_journal.xlsx   → 404
2. PUT  /me/drive/root:/Apps/HealthJournal/health_journal.xlsx:/content  → 201 (create)
   Body: [initial .xlsx with schema sheets]
   Response: { id, eTag }
```

### Connect (subsequent — file exists)

```
1. GET  /me/drive/root:/Apps/HealthJournal/health_journal.xlsx   → 200 { id, eTag }
2. GET  /me/drive/items/{id}/content                              → 302 → [.xlsx bytes]
```

### Write operation (append/update/delete)

```
1. PUT  /me/drive/items/{id}/content                              → 200 { eTag }
   Headers: If-Match: "{previous-eTag}"
   Body: [modified .xlsx bytes]
```

### Batch operation

Same as a single write — one upload. The "batch" is in-memory; all operations modify the workbook before a single upload.

## File size considerations

Microsoft Graph simple upload supports files up to 4MB. For ExcelDB's target use case:

- 1,000 rows with 10 columns of typical health data ≈ 50-100KB
- 10,000 rows ≈ 500KB-1MB
- The 4MB limit would accommodate roughly 40,000-80,000 rows

If a file exceeds 4MB, ExcelDB would need to switch to the resumable upload API (`POST /me/drive/items/{id}/createUploadSession`). This is a potential v2 enhancement but is unlikely to be needed for the initial use case.
