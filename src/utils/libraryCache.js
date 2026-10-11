const BOOK_CACHE_KEY = "community-library-books-cache-v1";

function isCachedBook(book) {
  return book !== null
    && typeof book === "object"
    && typeof book.id === "string"
    && typeof book.title === "string"
    && typeof book.author === "string"
    && typeof book.genre === "string"
    && typeof book.isbn === "string"
    && Number.isInteger(book.quantity)
    && Number.isInteger(book.priceCents);
}

export function readCachedBooks() {
  try {
    const savedBooks = window.localStorage.getItem(BOOK_CACHE_KEY);
    if (savedBooks === null) return [];
    const books = JSON.parse(savedBooks);
    if (!Array.isArray(books) || !books.every(isCachedBook)) {
      throw new Error("Saved book cache has an invalid format.");
    }
    return books;
  } catch (error) {
    console.error("Could not read the saved book catalog from local storage.", error);
    return [];
  }
}

export function saveCachedBooks(books) {
  try {
    window.localStorage.setItem(BOOK_CACHE_KEY, JSON.stringify(books));
  } catch (error) {
    console.error("Could not save the book catalog to local storage.", error);
  }
}
