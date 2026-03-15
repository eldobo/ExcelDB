# Jobs to Be Done

## The core job

**When** I'm building a personal app that needs to store structured data,
**I want** a backend that requires zero infrastructure and keeps data in a format I control,
**so that** I never have to set up a server, manage a database, or worry about vendor lock-in.

## Who this is for

ExcelDB is designed for solo developers building personal-use apps — health trackers, journals, habit logs, financial tools, inventory systems — where:

- The user is the developer (or there's a very small audience)
- Data volume is small (hundreds to low thousands of rows)
- The app runs on the user's own devices (phone, laptop, desktop)
- There's no need for multi-user collaboration or real-time sync

## What ExcelDB replaces

| Without ExcelDB | With ExcelDB |
|---|---|
| Provision a database (Supabase, Firebase, Postgres) | No database. Data lives in a `.xlsx` file in the user's own OneDrive. |
| Run or pay for a backend server | No server. The library runs entirely client-side. |
| Design and maintain an API layer | No API layer. ExcelDB provides typed CRUD methods directly. |
| Build data export/import features | No export needed. The data is already in Excel — the user can open, filter, chart, and edit it anytime. |
| Handle backup and retention | OneDrive handles versioning, backup, and sync across devices automatically. |
| Manage user accounts and auth | Microsoft OAuth with the user's existing Microsoft account. No user table, no password management. |

## Why Excel + OneDrive?

The format and storage choice is deliberate:

1. **Excel is the universal data tool.** Users can open the file, inspect their data, add charts, filter rows, and make corrections — without any app-specific export workflow.

2. **OneDrive is free cloud storage.** Every Microsoft account gets 5 GB. The user's data syncs across their devices and is backed up automatically. No recurring cost, no third-party dependency.

3. **The user owns their data.** It's a file in their personal cloud storage. They can move it, copy it, share it, or delete it. If they stop using the app, their data is still there in a standard format.

4. **No infrastructure to maintain.** No server to keep running, no database to patch, no cloud provider to pay. The entire stack is: client-side code + the user's own OneDrive.

## Situations where ExcelDB is the right choice

- **"I want to build a health journal app for myself."** Track symptoms, medications, vitals — with the ability to open the raw data in Excel for ad-hoc analysis or to share with a doctor.

- **"I need a simple personal inventory/catalogue system."** Books, recipes, plants, whatever — structured data that you want to access from your phone and laptop, without spinning up a database.

- **"I'm prototyping an app and need persistence without infrastructure."** Get a working data layer in minutes. If the app grows beyond ExcelDB's limits, the data is in a standard format ready to migrate.

- **"I want my data in a format I can always access."** No proprietary database format, no API dependency. If ExcelDB stops being maintained, the `.xlsx` file is still readable by any spreadsheet app.

## Situations where ExcelDB is NOT the right choice

- **Multi-user apps with concurrent writes.** ExcelDB uses file-level optimistic locking. It is designed for single-user or turn-based access.

- **Large datasets (10,000+ rows).** The entire file is downloaded, parsed, and re-uploaded on every write. This is fine for hundreds or low thousands of rows, not for large-scale data.

- **Apps that need real-time updates.** There's no subscription or push mechanism. The app polls or refreshes manually.

- **Apps that need complex queries.** ExcelDB supports key lookup and exact-match filtering. If you need joins, aggregations, or full-text search, use a real database.

## The enabling insight

Microsoft's Graph API lets any app — browser, mobile, desktop — read and write files in a user's OneDrive with just an OAuth token and a few HTTP calls. Combined with a client-side `.xlsx` parser (SheetJS), this turns OneDrive into a free, user-owned, standards-based data store that requires zero backend infrastructure.

ExcelDB wraps this capability in a developer-friendly TypeScript API: define a schema, connect, and call `table.append()` / `table.getAll()`. The complexity of OAuth, binary file parsing, conflict detection, and type coercion is handled internally.
