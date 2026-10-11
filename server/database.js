import "dotenv/config";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initialBooks, initialTransactions, initialUsers } from "../src/data/initialData.js";

const databasePath = resolve(process.env.LIBRARY_DATABASE_PATH || resolve(dirname(fileURLToPath(import.meta.url)), "data/library.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE COLLATE NOCASE,
      membership_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('Librarian', 'Member')),
      password_salt TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      genre TEXT NOT NULL,
      isbn TEXT NOT NULL UNIQUE,
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
      price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      book_id TEXT,
      book_title TEXT NOT NULL,
      user_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      date TEXT NOT NULL,
      details TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS supplier_orders (
      id TEXT PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Ordered', 'Received')),
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      received_at TEXT
    );
    CREATE TABLE IF NOT EXISTS supplier_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES books(id),
      book_title TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Paid', 'Expired', 'Failed')),
      stripe_session_id TEXT UNIQUE,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES books(id),
      book_title TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );
  `);

  const insertBook = db.prepare(`
    INSERT OR IGNORE INTO books (id, title, author, genre, isbn, quantity, price_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const [index, book] of initialBooks.entries()) {
    insertBook.run(book.id, book.title, book.author, book.genre, book.isbn, book.quantity, book.priceCents ?? [24900, 27900, 34900, 39900][index]);
  }

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, membership_id, role)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const user of initialUsers) {
    insertUser.run(user.id, user.name, user.email ?? null, user.membershipId, user.role);
  }

  const insertTransaction = db.prepare(`
    INSERT OR IGNORE INTO transactions (id, type, book_id, book_title, user_name, quantity, date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const transaction of initialTransactions) {
    insertTransaction.run(transaction.id, transaction.type, transaction.bookId, transaction.bookTitle, transaction.userName, transaction.quantity, transaction.date);
  }
}

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    membershipId: row.membership_id,
    role: row.role,
  };
}

export function supplierNameForBookTitle(title) {
  return title.trim().toLowerCase() === "html consepts"
    ? "HTML Books supplier"
    : `${title.trim()} Supplier`;
}

export function publicBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genre: row.genre,
    isbn: row.isbn,
    supplierName: row.supplier_name ?? supplierNameForBookTitle(row.title),
    quantity: row.quantity - row.reserved_quantity,
    totalQuantity: row.quantity,
    priceCents: row.price_cents,
    reservedQuantity: row.reserved_quantity,
  };
}

export function publicTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    bookId: row.book_id,
    bookTitle: row.book_title,
    userName: row.user_name,
    quantity: row.quantity,
    date: row.date,
    details: row.details,
  };
}

export function publicSupplierOrder(row) {
  return {
    id: row.id,
    supplierName: row.supplier_name,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by_name,
    receivedAt: row.received_at,
    items: row.items,
  };
}
