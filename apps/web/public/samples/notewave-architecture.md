# Notewave architecture

Notewave is a realtime collaborative notes app for students. Several people can edit the
same note at once, from the browser or from a phone, and see each other's changes live.

## Stack

The web app is built with Next.js 16 and deployed on Vercel. Data lives in Supabase:
PostgreSQL for notes and users, Supabase Auth for sign-in, and Supabase Realtime for live
updates. Search over notes uses pgvector embeddings stored next to each note.

## Data model

Each note is one row in the `notes` table with a `content` column (Markdown), an
`updated_at` timestamp, and an integer `version` column that increases on every write.
Access is enforced in the database with Row Level Security (RLS): a note is visible only to
members of its workspace.

## Conflict handling

Each note row carries a version column. Writes use optimistic locking: the client sends
the version it last read, and the update is rejected when the stored version has changed.
The client then fetches the latest state and re-applies the pending edit. Most conflicts are
resolved automatically this way; if the same paragraph was changed by both people, the
editor shows both versions side by side and lets the user pick one.

## Realtime sync

Changes are broadcast through one Supabase Realtime channel per note over a WebSocket, so
collaborators receive updates in roughly 150 ms. Presence (who is viewing a note) uses the
same channel.

## Offline mode

Edits made offline are queued in IndexedDB and replayed in order when the connection comes
back. Each queued edit still goes through optimistic locking, so offline edits never
overwrite newer changes silently.
