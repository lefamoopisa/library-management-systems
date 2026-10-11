import "dotenv/config";
import { randomUUID, createHash, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import Stripe from "stripe";
import { clearSession, createSession, getSessionUser, passwordDigest, passwordMatches } from "./auth.js";
import { db, initializeDatabase, publicBook, publicSupplierOrder, publicTransaction, publicUser, supplierNameForBookTitle } from "./database.js";

initializeDatabase();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const libraryDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(libraryDir, "../dist");
const activeLoginAttempts = new Map();
const checkoutCurrency = "lsl";
const checkoutCurrencySupported = false;
const bookSelect = `
  SELECT books.*,
    (SELECT supplier_orders.supplier_name
     FROM supplier_order_items
     JOIN supplier_orders ON supplier_orders.id = supplier_order_items.order_id
     WHERE supplier_order_items.book_id = books.id
     ORDER BY supplier_orders.created_at DESC, supplier_orders.rowid DESC
     LIMIT 1) AS supplier_name
  FROM books
`;
const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...(process.env.PUBLIC_APP_URL ? [new URL(process.env.PUBLIC_APP_URL).origin] : []),
]);

function fail(response, status, message) {
  return response.status(status).json({ error: message });
}

function requireUser(request, response, next) {
  const user = getSessionUser(request);
  if (!user) return fail(response, 401, "Please sign in to continue.");
  request.user = user;
  next();
}

function requireLibrarian(request, response, next) {
  if (request.user?.role !== "Librarian") return fail(response, 403, "Librarian access is required.");
  next();
}

function normalizeBookInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Enter valid book details." };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const genre = typeof body.genre === "string" ? body.genre.trim() : "";
  const isbn = typeof body.isbn === "string" ? body.isbn.trim().replace(/[\s-]/g, "").toUpperCase() : "";
  const quantity = Number(body.quantity);
  const priceCents = Number(body.priceCents);
  if (!title || !author || !genre || !isbn || title.length > 120 || author.length > 100 || genre.length > 50 || isbn.length > 20) {
    return { error: "Enter a valid title, author, genre, and ISBN." };
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 9999) return { error: "Quantity must be a whole number between 0 and 9999." };
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) return { error: "Enter a valid sale price." };
  return { book: { title, author, genre, isbn, quantity, priceCents } };
}

function canonicalIsbn(isbn) {
  return isbn.replace(/[\s-]/g, "").toUpperCase();
}

function bookWithSupplier(id) {
  return db.prepare(`${bookSelect} WHERE books.id = ?`).get(id);
}

function isbnExists(isbn, exceptId = "") {
  return db.prepare("SELECT id, isbn FROM books").all()
    .some((book) => book.id !== exceptId && canonicalIsbn(book.isbn) === isbn);
}

function listSupplierOrders() {
  const orders = db.prepare(`
    SELECT supplier_orders.*, users.name AS created_by_name
    FROM supplier_orders JOIN users ON users.id = supplier_orders.created_by
    ORDER BY supplier_orders.created_at DESC
  `).all();
  const getItems = db.prepare("SELECT * FROM supplier_order_items WHERE order_id = ? ORDER BY rowid");
  return orders.map((order) => publicSupplierOrder({
    ...order,
    items: getItems.all(order.id).map((item) => ({
      bookId: item.book_id,
      bookTitle: item.book_title,
      quantity: item.quantity,
      unitCostCents: item.unit_cost_cents,
    })),
  }));
}

function releaseReservation(saleId, status) {
  const sale = db.prepare("SELECT status FROM sales WHERE id = ?").get(saleId);
  if (!sale || sale.status !== "Pending") return;
  const items = db.prepare("SELECT book_id, quantity FROM sale_items WHERE sale_id = ?").all(saleId);
  const transaction = db.transaction(() => {
    for (const item of items) {
      db.prepare("UPDATE books SET reserved_quantity = MAX(0, reserved_quantity - ?) WHERE id = ?").run(item.quantity, item.book_id);
    }
    db.prepare("UPDATE sales SET status = ? WHERE id = ?").run(status, saleId);
  });
  transaction();
}

function completeSale(saleId, paidAt) {
  const sale = db.prepare("SELECT status, user_id FROM sales WHERE id = ?").get(saleId);
  if (!sale || sale.status !== "Pending") return;
  const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(saleId);
  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(sale.user_id);
  const transaction = db.transaction(() => {
    for (const item of items) {
      const book = db.prepare("SELECT quantity, reserved_quantity FROM books WHERE id = ?").get(item.book_id);
      if (!book || book.quantity < item.quantity || book.reserved_quantity < item.quantity) {
        throw new Error(`Inventory reservation is inconsistent for ${item.book_title}.`);
      }
      db.prepare("UPDATE books SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ? WHERE id = ?")
        .run(item.quantity, item.quantity, item.book_id);
      db.prepare(`
        INSERT INTO transactions (id, type, book_id, book_title, user_name, quantity, date, details)
        VALUES (?, 'Sold', ?, ?, ?, ?, ?, 'Paid online')
      `).run(randomUUID(), item.book_id, item.book_title, user.name, item.quantity, paidAt);
    }
    db.prepare("UPDATE sales SET status = 'Paid', paid_at = ? WHERE id = ?").run(paidAt, saleId);
  });
  transaction();
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (request, response) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return fail(response, 503, "Stripe webhook is not configured.");
  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, request.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook signature verification failed.", error.message);
    return fail(response, 400, "Invalid Stripe webhook signature.");
  }

  try {
    const applyEvent = db.transaction(() => {
      if (db.prepare("SELECT 1 FROM stripe_events WHERE id = ?").get(event.id)) return;
      db.prepare("INSERT INTO stripe_events (id, received_at) VALUES (?, ?)").run(event.id, new Date().toISOString());
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const checkout = event.data.object;
        const saleId = typeof checkout.metadata?.saleId === "string" ? checkout.metadata.saleId : "";
        const sale = db.prepare("SELECT id FROM sales WHERE stripe_session_id = ? OR id = ?")
          .get(checkout.id, saleId);
        if (sale && checkout.payment_status === "paid") {
          db.prepare("UPDATE sales SET stripe_session_id = ? WHERE id = ? AND stripe_session_id IS NULL").run(checkout.id, sale.id);
          completeSale(sale.id, new Date().toISOString());
        }
      } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        const checkout = event.data.object;
        const saleId = typeof checkout.metadata?.saleId === "string" ? checkout.metadata.saleId : "";
        const sale = db.prepare("SELECT id FROM sales WHERE stripe_session_id = ? OR id = ?")
          .get(checkout.id, saleId);
        if (sale) {
          db.prepare("UPDATE sales SET stripe_session_id = ? WHERE id = ? AND stripe_session_id IS NULL").run(checkout.id, sale.id);
          releaseReservation(sale.id, "Expired");
        }
      }
    });
    applyEvent();
  } catch (error) {
    console.error("Could not apply the Stripe webhook.", error);
    return fail(response, 500, "Could not apply the payment event.");
  }
  return response.json({ received: true });
});

app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api", (request, response, next) => {
  const origin = request.get("origin");
  if (origin && !allowedOrigins.has(origin)) return fail(response, 403, "This request origin is not allowed.");
  next();
});

app.get("/api/health", (_request, response) => response.json({
  ok: true,
  stripeConfigured: Boolean(stripe && process.env.STRIPE_WEBHOOK_SECRET),
  paymentsAvailable: Boolean(stripe && process.env.STRIPE_WEBHOOK_SECRET && checkoutCurrencySupported),
}));

app.post("/api/auth/register", (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === undefined ? "Librarian" : body.role;
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 200) {
    return fail(response, 400, "Enter a valid name, email, and password of at least 8 characters.");
  }
  if (!["Librarian", "Member"].includes(role)) return fail(response, 400, "Choose Librarian or Member as the account type.");
  if (db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) {
    return fail(response, 409, "An account with this email already exists. Please sign in instead.");
  }
  let membershipId;
  do {
    membershipId = `${role === "Librarian" ? "LIB" : "MEM"}-${String(100000 + Math.floor(Math.random() * 900000))}`;
  } while (db.prepare("SELECT 1 FROM users WHERE membership_id = ?").get(membershipId));
  const { salt, hash } = passwordDigest(password);
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, name, email, membership_id, role, password_salt, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, name, email, membershipId, role, salt, hash);
  createSession(id, response);
  return response.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});

app.post("/api/auth/migrate-member", (request, response) => {
  const { name, email, membershipId, password, passwordSalt, passwordHash } = request.body && typeof request.body === "object" ? request.body : {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const validIdentity = typeof name === "string" && name.trim().length > 0 && name.trim().length <= 100
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    && typeof membershipId === "string" && membershipId.length <= 24;
  if (!validIdentity || typeof password !== "string" || password.length < 8 || password.length > 200
    || typeof passwordSalt !== "string" || typeof passwordHash !== "string") {
    return fail(response, 400, "The saved account cannot be migrated. Check its details and try again.");
  }
  let oldHash;
  try {
    oldHash = pbkdf2Sync(password, Buffer.from(passwordSalt, "base64"), 120_000, 32, "sha256");
  } catch {
    return fail(response, 400, "The saved account credentials are invalid.");
  }
  const expectedHash = Buffer.from(passwordHash, "base64");
  if (expectedHash.length !== oldHash.length || !timingSafeEqual(oldHash, expectedHash)) {
    return fail(response, 401, "Email or password is incorrect.");
  }
  const emailOwner = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(normalizedEmail);
  if (emailOwner) {
    return fail(response, 409, "An account with this email already exists. Please sign in instead.");
  }
  let newMembershipId = membershipId.trim().toUpperCase();
  const existingMember = newMembershipId && db.prepare("SELECT * FROM users WHERE membership_id = ? AND role = 'Member'").get(newMembershipId);
  if (existingMember && !existingMember.password_hash) {
    const { salt, hash } = passwordDigest(password);
    db.prepare("UPDATE users SET name = ?, email = ?, password_salt = ?, password_hash = ? WHERE id = ?")
      .run(name.trim(), normalizedEmail, salt, hash, existingMember.id);
    createSession(existingMember.id, response);
    return response.status(200).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(existingMember.id)), migrated: true });
  }
  if (!newMembershipId || db.prepare("SELECT 1 FROM users WHERE membership_id = ?").get(newMembershipId)) {
    do {
      newMembershipId = `MEM-${String(100000 + Math.floor(Math.random() * 900000))}`;
    } while (db.prepare("SELECT 1 FROM users WHERE membership_id = ?").get(newMembershipId));
  }
  const { salt, hash } = passwordDigest(password);
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, name, email, membership_id, role, password_salt, password_hash) VALUES (?, ?, ?, ?, 'Member', ?, ?)")
    .run(id, name.trim(), normalizedEmail, newMembershipId, salt, hash);
  createSession(id, response);
  return response.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)), migrated: true });
});

app.post("/api/auth/login", (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const address = request.ip;
  const now = Date.now();
  const attempts = activeLoginAttempts.get(address);
  if (attempts && attempts.until > now && attempts.count >= 10) return fail(response, 429, "Too many sign-in attempts. Please wait 15 minutes and try again.");

  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
  if (!user || !passwordMatches(password, user.password_salt, user.password_hash)) {
    const current = attempts && attempts.until > now ? attempts : { count: 0, until: now + 15 * 60 * 1000 };
    current.count += 1;
    activeLoginAttempts.set(address, current);
    return fail(response, 401, "Email or password is incorrect.");
  }
  activeLoginAttempts.delete(address);
  createSession(user.id, response);
  return response.json({ user: publicUser(user) });
});

app.get("/api/auth/session", (request, response) => {
  const user = getSessionUser(request);
  if (!user) return response.json({ user: null });
  const { sessionTokenHash: _tokenHash, ...safeUser } = user;
  return response.json({ user: safeUser });
});

app.post("/api/auth/logout", (request, response) => {
  clearSession(request, response);
  return response.status(204).end();
});

app.use("/api", requireUser);

app.post("/api/presence", (_request, response) => response.status(204).end());

app.get("/api/dashboard-summary", (_request, response) => {
  const memberCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Member'").get().count;
  return response.json({ memberCount });
});

app.get("/api/books", (_request, response) => {
  const books = db.prepare(`${bookSelect} ORDER BY books.title COLLATE NOCASE`).all().map(publicBook);
  return response.json({ books });
});

app.post("/api/books", requireLibrarian, (request, response) => {
  const result = normalizeBookInput(request.body);
  if (result.error) return fail(response, 400, result.error);
  if (isbnExists(result.book.isbn)) return fail(response, 409, "Every book must have a different ISBN.");
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO books (id, title, author, genre, isbn, quantity, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, ...Object.values(result.book));
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(response, 409, "A book with this ISBN is already in the collection.");
    throw error;
  }
  return response.status(201).json({ book: publicBook(bookWithSupplier(id)) });
});

app.put("/api/books/:id", requireLibrarian, (request, response) => {
  const result = normalizeBookInput(request.body);
  if (result.error) return fail(response, 400, result.error);
  if (isbnExists(result.book.isbn, request.params.id)) return fail(response, 409, "Every book must have a different ISBN.");
  try {
    const book = db.prepare("SELECT reserved_quantity FROM books WHERE id = ?").get(request.params.id);
    if (!book) return fail(response, 404, "Book not found.");
    const updated = db.prepare("UPDATE books SET title = ?, author = ?, genre = ?, isbn = ?, quantity = ?, price_cents = ? WHERE id = ?")
      .run(result.book.title, result.book.author, result.book.genre, result.book.isbn, result.book.quantity + book.reserved_quantity, result.book.priceCents, request.params.id);
    if (!updated.changes) return fail(response, 404, "Book not found.");
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(response, 409, "A book with this ISBN is already in the collection.");
    throw error;
  }
  return response.json({ book: publicBook(bookWithSupplier(request.params.id)) });
});

app.delete("/api/books/:id", requireLibrarian, (request, response) => {
  const book = db.prepare("SELECT id FROM books WHERE id = ?").get(request.params.id);
  if (!book) return fail(response, 404, "Book not found.");
  const references = db.prepare(`
    SELECT EXISTS(SELECT 1 FROM sale_items WHERE book_id = ?) OR
           EXISTS(SELECT 1 FROM supplier_order_items WHERE book_id = ?)
  `).get(book.id, book.id);
  if (Object.values(references)[0]) return fail(response, 409, "This title has sales or supplier history and cannot be deleted.");
  db.prepare("DELETE FROM books WHERE id = ?").run(book.id);
  return response.status(204).end();
});

app.get("/api/users", requireLibrarian, (_request, response) => {
  const users = db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all().map(publicUser);
  return response.json({ users });
});

app.get("/api/shop/books", (_request, response) => {
  const books = db.prepare(`${bookSelect} WHERE books.quantity > books.reserved_quantity ORDER BY books.title COLLATE NOCASE`).all().map(publicBook);
  return response.json({ books });
});

app.post("/api/users", requireLibrarian, (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const membershipId = typeof body.membershipId === "string" ? body.membershipId.trim().toUpperCase() : "";
  const role = body.role;
  if (!name || name.length > 100 || !/^[A-Z0-9-]{3,24}$/.test(membershipId) || !["Member", "Librarian"].includes(role)) {
    return fail(response, 400, "Enter a name, valid membership ID, and role.");
  }
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO users (id, name, membership_id, role) VALUES (?, ?, ?, ?)").run(id, name, membershipId, role);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(response, 409, "That membership ID is already assigned.");
    throw error;
  }
  return response.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});

app.put("/api/users/:id", requireLibrarian, (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const membershipId = typeof body.membershipId === "string" ? body.membershipId.trim().toUpperCase() : "";
  const role = body.role;
  if (!name || name.length > 100 || !/^[A-Z0-9-]{3,24}$/.test(membershipId) || !["Member", "Librarian"].includes(role)) {
    return fail(response, 400, "Enter a name, valid membership ID, and role.");
  }
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(request.params.id);
  if (!target) return fail(response, 404, "Account not found.");
  if (target.id === request.user.id && role !== "Librarian") return fail(response, 400, "You cannot remove your own librarian access.");
  if (target.role === "Librarian" && role !== "Librarian" && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Librarian'").get().count < 2) {
    return fail(response, 400, "At least one librarian account must remain.");
  }
  try {
    db.prepare("UPDATE users SET name = ?, membership_id = ?, role = ? WHERE id = ?").run(name, membershipId, role, target.id);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return fail(response, 409, "That membership ID is already assigned.");
    throw error;
  }
  return response.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)) });
});

app.delete("/api/users/:id", requireLibrarian, (request, response) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(request.params.id);
  if (!target) return fail(response, 404, "Account not found.");
  if (target.id === request.user.id) return fail(response, 400, "You cannot remove the account you are currently using.");
  if (target.role === "Librarian" && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Librarian'").get().count < 2) {
    return fail(response, 400, "At least one librarian account must remain.");
  }
  const hasFinancialHistory = db.prepare(`
    SELECT EXISTS(SELECT 1 FROM sales WHERE user_id = ?) OR
           EXISTS(SELECT 1 FROM supplier_orders WHERE created_by = ?)
  `).get(target.id, target.id);
  if (Object.values(hasFinancialHistory)[0]) return fail(response, 409, "This account has sales or supplier records and cannot be deleted.");
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  return response.status(204).end();
});

app.post("/api/library/import", requireLibrarian, (request, response) => {
  const { books, users, transactions } = request.body && typeof request.body === "object" ? request.body : {};
  if (![books, users, transactions].every(Array.isArray) || books.length > 1000 || users.length > 1000 || transactions.length > 5000) {
    return fail(response, 400, "The saved browser library data is invalid or too large to import.");
  }
  const counts = { books: 0, users: 0, transactions: 0 };
  const importData = db.transaction(() => {
    for (const sourceBook of books) {
      const result = normalizeBookInput({
        ...sourceBook,
        priceCents: Number.isInteger(sourceBook.priceCents) ? sourceBook.priceCents : 0,
      });
      if (result.error) continue;
      const existing = db.prepare("SELECT * FROM books WHERE isbn = ?").get(result.book.isbn);
      if (existing) {
        const priceCents = Number.isInteger(sourceBook.priceCents) ? result.book.priceCents : existing.price_cents;
        db.prepare("UPDATE books SET title = ?, author = ?, genre = ?, quantity = ?, price_cents = ? WHERE id = ?")
          .run(result.book.title, result.book.author, result.book.genre, result.book.quantity + existing.reserved_quantity, priceCents, existing.id);
      } else {
        db.prepare("INSERT INTO books (id, title, author, genre, isbn, quantity, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(randomUUID(), result.book.title, result.book.author, result.book.genre, result.book.isbn, result.book.quantity, result.book.priceCents);
      }
      counts.books += 1;
    }

    for (const sourceUser of users) {
      const name = typeof sourceUser.name === "string" ? sourceUser.name.trim() : "";
      const membershipId = typeof sourceUser.membershipId === "string" ? sourceUser.membershipId.trim().toUpperCase() : "";
      const role = sourceUser.role === "Librarian" ? "Librarian" : "Member";
      if (!name || name.length > 100 || !/^[A-Z0-9-]{3,24}$/.test(membershipId)) continue;
      const existing = db.prepare("SELECT * FROM users WHERE membership_id = ?").get(membershipId);
      if (existing) {
        if (existing.id === request.user.id && role !== "Librarian") continue;
        db.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").run(name, role, existing.id);
      } else {
        db.prepare("INSERT INTO users (id, name, membership_id, role) VALUES (?, ?, ?, ?)")
          .run(randomUUID(), name, membershipId, role);
      }
      counts.users += 1;
    }
    if (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Librarian'").get().count < 1) {
      throw new Error("At least one librarian account must remain after import.");
    }

    for (const sourceTransaction of transactions) {
      const type = sourceTransaction.type;
      const quantity = Number(sourceTransaction.quantity);
      const title = typeof sourceTransaction.bookTitle === "string" ? sourceTransaction.bookTitle.trim() : "";
      const userName = typeof sourceTransaction.userName === "string" ? sourceTransaction.userName.trim() : "";
      const date = typeof sourceTransaction.date === "string" && Number.isFinite(Date.parse(sourceTransaction.date))
        ? new Date(sourceTransaction.date).toISOString()
        : "";
      if (!["Borrowed", "Stock added", "Sold"].includes(type) || !Number.isInteger(quantity) || quantity < 1 || !title || !userName || !date) continue;
      const id = typeof sourceTransaction.id === "string" && sourceTransaction.id.length < 100 ? sourceTransaction.id : randomUUID();
      const sourceBook = books.find((entry) => entry?.id === sourceTransaction.bookId);
      const book = db.prepare("SELECT id FROM books WHERE isbn = ?").get(sourceBook?.isbn ?? "");
      const imported = db.prepare(`
        INSERT OR IGNORE INTO transactions (id, type, book_id, book_title, user_name, quantity, date, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, type, book?.id ?? null, title, userName, quantity, date, typeof sourceTransaction.details === "string" ? sourceTransaction.details.slice(0, 200) : null);
      counts.transactions += imported.changes;
    }
  });
  try {
    importData();
  } catch (error) {
    console.error("Could not import saved browser library data.", error);
    return fail(response, 400, "The saved data could not be imported. No partial changes were made.");
  }
  return response.json({ imported: counts });
});

app.post("/api/transactions", (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const { bookId, quantity } = body;
  const type = body.type;
  const targetUserId = request.user.role === "Librarian" ? body.userId : request.user.id;
  if (typeof bookId !== "string" || (request.user.role === "Librarian" && typeof targetUserId !== "string")
    || !["Borrowed", "Stock added"].includes(type) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return fail(response, 400, "Choose a transaction type and a whole-number quantity.");
  }
  if (type === "Stock added" && request.user.role !== "Librarian") return fail(response, 403, "Only librarians can add stock.");
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(targetUserId);
  if (!book || !user) return fail(response, 404, "Book or member not found.");
  if (type === "Borrowed" && book.quantity - book.reserved_quantity < quantity) return fail(response, 409, "There are not enough copies available.");
  const date = new Date().toISOString();
  const id = randomUUID();
  const update = db.transaction(() => {
    db.prepare("UPDATE books SET quantity = quantity + ? WHERE id = ?").run(type === "Borrowed" ? -quantity : quantity, book.id);
    db.prepare("INSERT INTO transactions (id, type, book_id, book_title, user_name, quantity, date) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, type, book.id, book.title, user.name, quantity, date);
  });
  update();
  return response.status(201).json({
    transaction: publicTransaction(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id)),
    book: publicBook(bookWithSupplier(book.id)),
  });
});

app.get("/api/transactions", (_request, response) => {
  const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC").all().map(publicTransaction);
  return response.json({ transactions });
});

app.get("/api/supplier-orders", requireLibrarian, (_request, response) => response.json({ orders: listSupplierOrders() }));

app.post("/api/supplier-orders", requireLibrarian, (request, response) => {
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const book = typeof body.bookId === "string" ? db.prepare("SELECT * FROM books WHERE id = ?").get(body.bookId) : null;
  const supplierName = book ? supplierNameForBookTitle(book.title) : "";
  const quantity = Number(body.quantity);
  const unitCostCents = 2035;
  if (!book || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
    return fail(response, 400, "Choose a book and enter a valid quantity.");
  }
  const id = randomUUID();
  const order = db.transaction(() => {
    db.prepare("INSERT INTO supplier_orders (id, supplier_name, status, created_at, created_by) VALUES (?, ?, 'Ordered', ?, ?)")
      .run(id, supplierName, new Date().toISOString(), request.user.id);
    db.prepare("INSERT INTO supplier_order_items (id, order_id, book_id, book_title, quantity, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), id, book.id, book.title, quantity, unitCostCents);
  });
  order();
  const created = listSupplierOrders().find((entry) => entry.id === id);
  return response.status(201).json({ order: created });
});

app.post("/api/supplier-orders/:id/receive", requireLibrarian, (request, response) => {
  const order = db.prepare("SELECT * FROM supplier_orders WHERE id = ?").get(request.params.id);
  if (!order) return fail(response, 404, "Supplier order not found.");
  if (order.status !== "Ordered") return fail(response, 409, "This supplier order has already been received.");
  const items = db.prepare("SELECT * FROM supplier_order_items WHERE order_id = ?").all(order.id);
  const now = new Date().toISOString();
  const receive = db.transaction(() => {
    for (const item of items) {
      db.prepare("UPDATE books SET quantity = quantity + ? WHERE id = ?").run(item.quantity, item.book_id);
      db.prepare("INSERT INTO transactions (id, type, book_id, book_title, user_name, quantity, date, details) VALUES (?, 'Stock added', ?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), item.book_id, item.book_title, request.user.name, item.quantity, now, `Supplier: ${order.supplier_name}`);
    }
    db.prepare("UPDATE supplier_orders SET status = 'Received', received_at = ? WHERE id = ?").run(now, order.id);
  });
  receive();
  return response.json({ order: listSupplierOrders().find((entry) => entry.id === order.id) });
});

app.get("/api/online-customers", requireLibrarian, (_request, response) => {
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  const customers = db.prepare(`
    SELECT users.membership_id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE users.role = 'Member' AND sessions.expires_at > ? AND sessions.last_seen >= ?
    GROUP BY users.id
    ORDER BY MAX(sessions.last_seen) DESC
  `).all(new Date().toISOString(), activeSince).map((customer) => ({ membershipId: customer.membership_id }));
  return response.json({ customers });
});

app.get("/api/shop/sales", (request, response) => {
  const isManager = request.user.role === "Librarian";
  const sales = db.prepare(`
    SELECT sales.*, users.name AS customer_name
    FROM sales JOIN users ON users.id = sales.user_id
    ${isManager ? "" : "WHERE sales.user_id = ?"}
    ORDER BY sales.created_at DESC
    LIMIT 100
  `).all(...(isManager ? [] : [request.user.id])).map((sale) => ({
    id: sale.id,
    status: sale.status,
    customerName: sale.customer_name,
    createdAt: sale.created_at,
    paidAt: sale.paid_at,
    items: db.prepare("SELECT book_title AS bookTitle, quantity, unit_price_cents AS unitPriceCents FROM sale_items WHERE sale_id = ?").all(sale.id),
  }));
  return response.json({ sales });
});

app.post("/api/checkout", (request, response) => {
  if (request.user.role !== "Member") return fail(response, 403, "Book purchases are available to member accounts.");
  if (!checkoutCurrencySupported) return fail(response, 503, "Stripe does not support Lesotho loti (LSL) checkout. No payment was taken.");
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return fail(response, 503, "Online checkout is not configured yet. Ask the librarian to finish the private Stripe setup.");
  const body = request.body && typeof request.body === "object" ? request.body : {};
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return fail(response, 400, "Choose at least one book to purchase.");
  const quantities = new Map();
  for (const item of body.items) {
    if (typeof item.bookId !== "string" || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      return fail(response, 400, "Each book quantity must be a whole number between 1 and 20.");
    }
    quantities.set(item.bookId, (quantities.get(item.bookId) ?? 0) + item.quantity);
  }
  const items = [];
  for (const [bookId, quantity] of quantities) {
    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
    if (!book || book.price_cents < 1) return fail(response, 400, "One of the selected books is unavailable for purchase.");
    if (book.quantity - book.reserved_quantity < quantity) return fail(response, 409, `${book.title} does not have enough available copies.`);
    items.push({ ...book, orderQuantity: quantity });
  }

  const saleId = randomUUID();
  const createdAt = new Date().toISOString();
  const reserve = db.transaction(() => {
    db.prepare("INSERT INTO sales (id, user_id, status, created_at) VALUES (?, ?, 'Pending', ?)")
      .run(saleId, request.user.id, createdAt);
    for (const item of items) {
      db.prepare("UPDATE books SET reserved_quantity = reserved_quantity + ? WHERE id = ?").run(item.orderQuantity, item.id);
      db.prepare("INSERT INTO sale_items (id, sale_id, book_id, book_title, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), saleId, item.id, item.title, item.orderQuantity, item.price_cents);
    }
  });
  reserve();

  const origin = new URL(process.env.PUBLIC_APP_URL || `${request.protocol}://${request.get("host")}`).origin;
  stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: request.user.id,
    customer_email: request.user.email,
    metadata: { saleId },
    payment_intent_data: { metadata: { saleId } },
    line_items: items.map((item) => ({
      quantity: item.orderQuantity,
      price_data: {
        currency: checkoutCurrency,
        unit_amount: item.price_cents,
        product_data: { name: item.title, description: `${item.author} · ${item.genre}` },
      },
    })),
    success_url: `${origin}/#/shop?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#/shop?purchase=cancelled`,
  }).then((session) => {
    db.prepare("UPDATE sales SET stripe_session_id = ? WHERE id = ?").run(session.id, saleId);
    return response.json({ checkoutUrl: session.url });
  }).catch((error) => {
    releaseReservation(saleId, "Failed");
    console.error("Could not create a Stripe Checkout session.", error);
    return fail(response, 502, "The payment provider could not start checkout. No payment was taken.");
  });
});

app.get("/api/shop/purchase-status", (request, response) => {
  const sessionId = request.query.sessionId;
  if (typeof sessionId !== "string") return fail(response, 400, "A checkout session is required.");
  const sale = db.prepare("SELECT * FROM sales WHERE stripe_session_id = ? AND user_id = ?").get(sessionId, request.user.id);
  if (!sale) return fail(response, 404, "Purchase not found.");
  return response.json({ status: sale.status });
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*path", (_request, response, next) => {
    response.sendFile(resolve(distDir, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _request, response, _next) => {
  console.error("Unhandled API error.", error);
  if (response.headersSent) return;
  return response.status(500).json({ error: "The server could not complete this request." });
});

const host = process.env.HOST ?? "127.0.0.1";
app.listen(port, host, () => {
  console.log(`Library API listening on http://${host}:${port}`);
  if (!checkoutCurrencySupported) console.warn("Stripe Checkout is disabled because Stripe does not support Lesotho loti (LSL).");
  else if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) console.warn("Stripe Checkout is disabled until STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are configured.");
});
