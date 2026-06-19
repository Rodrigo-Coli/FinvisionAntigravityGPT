# Global Development Rules & Protocols

## 🚀 Deployment & Synchronization
- **One Sync, One Commit**: All file updates MUST be sent to GitHub in a single commit whenever possible.
- **Batching API Calls**: When using the GitHub API (especially via `sync.ps1`), do NOT use the `PUT /contents` endpoint in a loop. Use the Git Data API (Blobs -> Trees -> Commits -> Refs) to bundle all changes into one deployment trigger.
- **Vercel Priority**: Avoid cluttering the Vercel deployment queue. Wait for a deployment to finish or ensure only the "Final Approved" version is pushed.

## 🛠️ Performance & UX
- **Search Debouncing**: Always use `debouncedSearch` for API calls to prevent flickering.
- **Accent-Insensitive Search**: Ensure PostgreSQL `iregex` patterns are correctly quoted and handle common Portuguese characters (ã, á, ç, etc.).

## 🔐 Security & Persistence
- **Metadata Management**: Critical transaction data (transfers, installments) must be correctly mapped to the `metadata` jsonb column.
- **Service Worker Awareness**: Always remind the user to perform a "Hard Refresh" (Ctrl+F5) after a deploy to clear PWA/SW caching.
