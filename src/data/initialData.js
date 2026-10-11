export const initialBooks = [
  { id: "book-1", title: "The Midnight Library", author: "Matt Haig", genre: "Fiction", isbn: "9780525559474", quantity: 4, priceCents: 24900 },
  { id: "book-2", title: "Braiding Sweetgrass", author: "Robin Wall Kimmerer", genre: "Nature", isbn: "9781571313560", quantity: 1, priceCents: 27900 },
  { id: "book-3", title: "A Brief History of Time", author: "Stephen Hawking", genre: "Science", isbn: "9780553380163", quantity: 3, priceCents: 34900 },
  { id: "book-4", title: "The Creative Act", author: "Rick Rubin", genre: "Arts", isbn: "9780593652886", quantity: 0, priceCents: 39900 },
];

export const initialUsers = [
  { id: "user-1", name: "Lefa Moopisa", membershipId: "LIB-001", role: "Librarian" },
  { id: "user-2", name: "Moopisa Lefa", membershipId: "MEM-102", role: "Member" },
  { id: "user-3", name: "Taylor Smith", membershipId: "MEM-208", role: "Member" },
];

export const initialTransactions = [
  { id: "transaction-1", type: "Borrowed", bookId: "book-2", bookTitle: "Braiding Sweetgrass", userName: "Moopisa Lefa", quantity: 1, date: "2026-10-03T10:20:00.000Z" },
  { id: "transaction-2", type: "Stock added", bookId: "book-1", bookTitle: "The Midnight Library", userName: "Lefa Moopisa", quantity: 2, date: "2026-10-02T14:45:00.000Z" },
];
