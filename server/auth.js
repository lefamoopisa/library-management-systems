import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, publicUser } from "./database.js";

const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 14;

export function passwordDigest(password, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex"),
  };
}

export function passwordMatches(password, salt, hash) {
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenDigest(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(userId, response) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_LIFETIME_MS);
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(tokenDigest(token), userId, now.toISOString(), now.toISOString(), expires.toISOString());
  response.cookie("library_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_LIFETIME_MS,
  });
}

export function getSessionUser(request) {
  const token = request.cookies?.library_session;
  if (!token) return null;
  const digest = tokenDigest(token);
  const session = db.prepare(`
    SELECT users.*, sessions.token_hash
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(digest, new Date().toISOString());
  if (!session) return null;
  db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(new Date().toISOString(), digest);
  return { ...publicUser(session), sessionTokenHash: digest };
}

export function clearSession(request, response) {
  const token = request.cookies?.library_session;
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenDigest(token));
  response.clearCookie("library_session", { httpOnly: true, sameSite: "lax", path: "/" });
}
