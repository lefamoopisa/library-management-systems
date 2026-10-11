import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { EmptyState, PageHeader } from "../components/Common.jsx";

const emptyBook = { title: "", author: "", genre: "", isbn: "", quantity: "1", price: "0" };
const canonicalIsbn = (isbn) => isbn.trim().replace(/[\s-]/g, "").toUpperCase();

export default function BooksPage({ books, onSave, onDelete, canManage }) {
  const [form, setForm] = useState(emptyBook);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return books.filter((book) => [book.title, book.author, book.genre, book.isbn].some((value) => value.toLowerCase().includes(query)));
  }, [books, search]);

  function resetForm() {
    setForm(emptyBook);
    setEditingId(null);
    setError("");
    setShowForm(false);
  }
  function startEditing(book) {
    setEditingId(book.id);
    setForm({ ...book, quantity: String(book.quantity), price: (book.priceCents / 100).toFixed(2) });
    setError("");
    setShowForm(true);
  }
  async function submitBook(event) {
    event.preventDefault();
    const isbn = canonicalIsbn(form.isbn);
    if (books.some((book) => canonicalIsbn(book.isbn) === isbn && book.id !== editingId)) {
      setError("Every book must have a different ISBN.");
      return;
    }
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000) {
      setError("Enter a valid selling price.");
      return;
    }
    const updatedBook = { title: form.title.trim(), author: form.author.trim(), genre: form.genre.trim(), isbn, quantity: Number(form.quantity), priceCents: Math.round(price * 100) };
    setIsSaving(true);
    try {
      await onSave(updatedBook, editingId);
      resetForm();
    } catch (cause) {
      setError(cause.message || "Could not save the book.");
    } finally {
      setIsSaving(false);
    }
  }
  async function deleteBook(book) {
    if (!window.confirm(`Remove "${book.title}" from the collection?`)) return;
    try {
      await onDelete(book.id);
    } catch (cause) {
      setError(cause.message || "Could not remove the book.");
    }
  }

  return <>
    <PageHeader eyebrow="THE COLLECTION" title="Books" description="Keep the shelves current and every story findable."
      action={canManage && <button className="button button--primary" onClick={() => { setForm(emptyBook); setEditingId(null); setError(""); setShowForm(true); }}><Plus size={17} /> Add a book</button>} />
    {showForm && canManage && <section className="panel book-form-panel">
      <div className="panel-heading"><div><p className="eyebrow">{editingId ? "EDIT COLLECTION" : "NEW TO THE SHELVES"}</p><h2>{editingId ? "Update book details" : "Add a book"}</h2></div><button className="icon-button" onClick={resetForm} aria-label="Close form"><X size={18} /></button></div>
      <form className="form-grid" onSubmit={submitBook}>
        <label className="field-span-2">Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={120} /></label>
        <label>Author<input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} required maxLength={100} /></label>
        <label>Genre<input value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })} required maxLength={50} placeholder="e.g. Fiction" /></label>
        <label>ISBN<input value={form.isbn} onChange={(event) => setForm({ ...form, isbn: event.target.value })} required maxLength={20} /></label>
        <label>Initial quantity<input type="number" min="0" max="9999" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></label>
        <label>Selling price (M)<input type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
        {error && <p className="form-error field-span-2" role="alert">{error}</p>}
        <div className="form-actions field-span-2"><button type="button" className="button button--quiet" onClick={resetForm}>Cancel</button><button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : editingId ? "Save changes" : "Add to collection"}</button></div>
      </form>
    </section>}
    {!showForm && error && <p className="form-error page-alert" role="alert">{error}</p>}
    <section className="panel">
      <div className="list-toolbar"><div><p className="eyebrow">SHELF DIRECTORY</p><h2>All titles <span className="count-badge">{books.length}</span></h2></div><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search books..." aria-label="Search books" /></label></div>
      {filteredBooks.length ? <div className="table-wrap table-wrap--cards"><table className="directory-table directory-table--books">
        <thead><tr><th>BOOK</th><th>GENRE</th><th>ISBN</th><th>IN STOCK</th>{canManage && <th className="actions-column">ACTIONS</th>}</tr></thead>
        <tbody>{filteredBooks.map((book) => <tr key={book.id}>
          <td data-label="Book"><div className="book-cell"><span><strong>{book.title}</strong><small>{book.author}</small></span></div></td>
          <td data-label="Genre"><span className="genre-pill">{book.genre}</span></td><td data-label="ISBN" className="isbn-cell">{book.isbn}</td>
          <td data-label="In stock"><span className={`stock-status${book.quantity < 2 ? " stock-status--low" : ""}`}><i />{book.quantity}</span></td>
          {canManage && <td data-label="Actions"><div className="row-actions"><button className="button button--small button--quiet" onClick={() => startEditing(book)}>Update</button><button className="button button--small button--danger-quiet" onClick={() => deleteBook(book)}>Delete</button></div></td>}
        </tr>)}</tbody>
      </table></div> : <EmptyState title={search ? "No books found" : "No books on the shelf"} description={search ? "Try another title, author, genre, or ISBN." : "Add a book to begin building your library collection."} />}
    </section>
  </>;
}
