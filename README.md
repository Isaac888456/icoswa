# ICOSWA Dues Management — Next.js + MongoDB

A full-stack rewrite of the ICOSWA association dues tracker. The UI is built with Next.js App Router and React; the server API persists shared application state in MongoDB. It supports teacher records, monthly dues register, previous-month payments, historical contribution rates, cash/E-Cash, receipts, reversals, reports, CSV export and JSON backup/restore.

## Requirements
- Node.js 20.9 or newer
- A MongoDB database, either MongoDB Atlas or a local MongoDB server

## Setup
1. Extract the ZIP and open the project folder in a terminal.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local`.
4. Set `MONGODB_URI` to your MongoDB connection string and `MONGODB_DB=icoswa_dues`. In MongoDB Atlas, allow network access from the server running the app and create a database user with least-privilege access. Never commit `.env.local` or share your connection string.
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open http://localhost:3000.
7. For production, deploy to a Node.js-compatible host (for example, Vercel) and set the same environment variables in the hosting dashboard. Add the deployed server's network access to MongoDB Atlas if needed.

## Dues rates and previous months
Go to **Settings & Backup → Dues rate history** and add each effective month and amount (e.g. `2026-01` = GH₵50 and `2026-07` = GH₵60). The earliest configured rate is used for earlier periods. In **Record Payment**, select the actual date money was received and separately choose the month the payment covers. The selected month's historical rate determines the outstanding balance. A payment cannot exceed that month's remaining balance; record separate allocations for separate months.

## Data storage
The API stores the application's state in one MongoDB document in the `application_state` collection (`_id: main`). This is a straightforward migration from the previous localStorage structure and works for a small association. For a larger deployment or high-concurrency use, split teachers, payments, allocations, settings and audit events into separate collections and use atomic operations/transactions.

## Important security note
This starter does **not** include user login, roles, CSRF protection or audit-grade concurrent writes. Do not expose the deployed application publicly with real teacher/financial data until authentication and authorization are implemented and tested. Restrict access to the deployment and MongoDB database. Do not use the MongoDB URI in client-side code.

## Backups
Use **Settings & Backup → Download JSON backup** regularly. JSON backups contain personal and financial information; keep them in a secure location. Importing a backup replaces the current shared application state.

## Scope
E-Cash is a record of an electronic/mobile-money payment already received. This app does not initiate or verify payments through a mobile-money provider.
