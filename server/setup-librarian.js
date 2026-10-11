import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { passwordDigest } from "./auth.js";
import { db, initializeDatabase } from "./database.js";

initializeDatabase();
const librarian = db.prepare("SELECT * FROM users WHERE id = 'user-1' AND role = 'Librarian'").get();
if (!librarian) throw new Error("The initial librarian account is missing from the database.");

const prompt = createInterface({ input: stdin, output: stdout });
const email = (await prompt.question("Librarian email: ")).trim().toLowerCase();
prompt.close();

function askPasswordHidden(label) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(new Error("Run npm run setup:librarian in an interactive terminal."));
      return;
    }
    stdout.write(label);
    let password = "";
    const previousRawMode = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          stdin.off("data", onData);
          stdin.setRawMode(previousRawMode);
          reject(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode(previousRawMode);
          stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else if (character >= " ") password += character;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await askPasswordHidden("Librarian password (at least 8 characters): ");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
if (password.length < 8 || password.length > 200) throw new Error("Password must be between 8 and 200 characters.");
const emailOwner = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
if (emailOwner && emailOwner.id !== librarian.id) throw new Error("That email address is already assigned to another account.");

const { salt, hash } = passwordDigest(password);
db.prepare("UPDATE users SET email = ?, password_salt = ?, password_hash = ? WHERE id = ?")
  .run(email, salt, hash, librarian.id);
console.log(`Librarian sign-in is ready for ${email}.`);
