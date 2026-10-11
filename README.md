# Community Library Management System

A browser-based React library-management system backed by a Node.js API and
SQLite. The server is the source of truth for accounts, roles, book stock,
transactions, supplier orders, and customer presence. The browser keeps a
Local Storage cache of the public book catalog for quick reloads; server data
remains authoritative and overwrites the cache after a successful sync.
Passwords are hashed on the server, and sign-in uses an HTTP-only session
cookie. Account credentials, sessions, and member records are not stored in
Local Storage.

## Run locally

Install Node.js 20 or newer, then open this folder in a terminal:

```sh
npm install
npm run setup:librarian
npm start
```

The librarian setup asks for an email and password; password input is not
echoed. `npm start` launches both the API (`http://localhost:3001`) and the
Vite website (`http://localhost:5173`). Keep the terminal open while testing.
New visitors can select Librarian or Member when creating an account. Librarians
can manage the catalog and suppliers; members can browse and buy books. Only
genuinely signed-in members are shown in the live dashboard list, which displays
their membership IDs only.

Public librarian registration is enabled as requested. Anyone who can reach a
publicly hosted sign-up page can therefore create a librarian account; restrict
registration before deploying this educational app for public use.

The first server launch creates `server/data/library.sqlite` and seeds the
sample collection. The database is local and ignored by Git. It contains the
shared data for browsers connected to this server. Do not double-click
`index.html` in File Explorer: it shows server startup instructions because a
file opened directly cannot use the authenticated API.

## Assignment requirements

This is a web-based system, not a native/mobile application. It uses React
components and hooks (`useState`, `useEffect`, and `useMemo`), hash-based React
Router navigation, controlled and validated forms, and reusable page/layout
components. Librarians can create, update, and remove books and user records,
track low stock, add supplier stock, and record borrowing transactions. The
browser stores a non-sensitive book-catalog cache in Local Storage; the
server-side SQLite database synchronizes shared accounts, stock, and
transactions across users.

## Publish the full website with GitHub and Render

Pushing this project to GitHub stores the source code; opening the repository
link does not start the Node server. To give people a working website link:

1. Push the project to a GitHub repository.
2. In Render, choose **New +** → **Blueprint**, connect that repository, and
   deploy the included `render.yaml`.
3. Wait for the build and health check to finish, then open the service's
   `onrender.com` URL. Share that URL with library users, not the GitHub
   repository URL or a copy of `index.html`.
4. Open the deployed site and create a Librarian account to manage the library.

The Render blueprint builds the React frontend, starts the Node API, and stores
SQLite data on a persistent disk. Render persistent disks require a paid web
service; check Render's current pricing before deploying. Do not remove or
replace the disk after users have created accounts or library data. Stripe
checkout remains unavailable because LSL is not supported.

Opening `index.html` by itself cannot start Node.js or provide server-backed
accounts and shared data. The full website must be opened through the local
`npm start` address or the deployed Render URL.

## Move data from the older browser-only app

If this browser has the previous app's local data, sign in as a librarian and
choose **Import saved data** on the dashboard. The import copies the saved
books, members, and transaction history to the server. It updates quantities
for matching ISBNs, so review the prompt before importing. Legacy member
accounts can be migrated by signing in with their existing email and password;
they retain the Member role.

## Supplier orders

Librarians can open **Suppliers** to select a book and quantity. Its supplier
name is filled automatically from the book title (for example, **Braiding
Sweetgrass Supplier**; **HTML consepts** uses **HTML Books supplier**).
Supplier cost is fixed at M20.35 per copy, and the displayed total updates with
the quantity. Mark an order received when the books arrive; only then are
copies added to inventory and transaction history.
Supplier orders are purchase records only—the app does not initiate payments
from the library to suppliers or store the library's bank details.

## Customer book sales and payments

Members can browse **Shop** and see prices in Lesotho maloti (M). Stripe does
not support LSL checkout, so the payment step is disabled and no payment is
taken. The app does not collect banking details. Do not replace the hosted
payment-provider flow with a form that accepts arbitrary banking details or
conceals test-mode status. Re-enable checkout only after choosing a provider
that supports LSL, using its hosted payment page and clearly identified test
mode.

## Online customers

The librarian dashboard shows signed-in members who have used the app within
the last 90 seconds. Browsers send an authenticated activity heartbeat every
30 seconds. Librarians are excluded from the customer list.

## Build and deployment

```sh
npm run build
```

The build writes the frontend to `dist/`. To serve it and the API from one Node
process after building, run:

```sh
npm run start:server
```

`npm run preview` serves only the built frontend; run the API with
`npm run start:server` in another terminal when previewing locally.

GitHub can host this source repository, but GitHub Pages alone cannot run the
Node API, SQLite database, or Stripe webhook. For a live deployment, host the
Node server separately (or use a Node-capable host), provide HTTPS and the
private environment variables, configure the Stripe webhook to reach
`/api/stripe/webhook`, and attach persistent storage for `server/data`.
Configure `PUBLIC_APP_URL` to the deployed app origin and `HOST=0.0.0.0` when
the host requires it. Back up the SQLite database and use Stripe live keys only
after completing a production security review.

## Features

- React hooks, controlled forms, responsive layouts, and hash-based routing.
- Server-managed member registration, librarian-only management, and
  HTTP-only sign-in sessions.
- Shared book catalog, circulation checkouts, and transaction history.
- Supplier purchase orders with automatic supplier names, fixed M20.35 per-copy
  costs, and stock receiving.
- Retail book browsing with prices displayed in Lesotho maloti; checkout stays
  disabled until a supported LSL payment provider is configured.
- Librarian dashboard view of currently active member sessions.

This is an educational prototype, not a complete retail or accounting system.
Supplier payments, shipping, tax, refunds, and customer support processes are
not handled here.
