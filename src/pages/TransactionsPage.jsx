import { useMemo, useState } from "react";
import { EmptyState, PageHeader } from "../components/Common.jsx";

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export default function TransactionsPage({ books, transactions, users, currentUser, canManage, onSubmitTransaction }) {
  const [type, setType] = useState("Borrowed");
  const [bookId, setBookId] = useState("");
  const [userId, setUserId] = useState(currentUser.id);
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sortedTransactions = useMemo(() => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)), [transactions]);

  async function submitTransaction(event) {
    event.preventDefault();
    const amount = Number(quantity);
    if (!bookId || (canManage && !users.some((user) => user.id === userId)) || !Number.isInteger(amount) || amount < 1) {
      setError("Choose a book and member, and enter a quantity of at least 1.");
      return;
    }
    if (!canManage && type !== "Borrowed") {
      setError("Only librarians can add stock.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmitTransaction({ type, bookId, quantity: amount, userId: canManage ? userId : currentUser.id });
      setError("");
      setQuantity("1");
    } catch (cause) {
      setError(cause.message || "Could not record the transaction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <>
    <PageHeader eyebrow="CIRCULATION DESK" title="Transactions" description={canManage ? "Check books out and log new arrivals to keep stock accurate." : "Check books out and review your library's transaction history."} />
    <div className="transactions-layout">
      <section className="panel transaction-form-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">{canManage ? "UPDATE STOCK" : "BORROW A BOOK"}</p><h2>Record a transaction</h2></div>
        </div>
        <div className={`transaction-toggle${canManage ? "" : " transaction-toggle--single"}`} role="group" aria-label="Transaction type">
          <button className={type === "Borrowed" ? "transaction-toggle__button is-selected" : "transaction-toggle__button"} onClick={() => { setType("Borrowed"); setError(""); }} type="button">Check out</button>
          {canManage && <button className={type === "Stock added" ? "transaction-toggle__button is-selected" : "transaction-toggle__button"} onClick={() => { setType("Stock added"); setError(""); }} type="button">Add stock</button>}
        </div>
        <form className="form-stack" onSubmit={submitTransaction}>
          <label>Book<select value={bookId} onChange={(event) => setBookId(event.target.value)} required><option value="">Choose a title</option>{books.map((book) => <option value={book.id} key={book.id}>{book.title} ({book.quantity} in stock)</option>)}</select></label>
          {canManage
            ? <label>{type === "Borrowed" ? "Member" : "Recorded by"}<select value={userId} onChange={(event) => setUserId(event.target.value)} required>{users.map((user) => <option value={user.id} key={user.id}>{user.name} · {user.membershipId}</option>)}</select></label>
            : <label>Member<input value={currentUser.name} readOnly /></label>}
          <label>Quantity<input type="number" min="1" max="9999" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--wide" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : type === "Borrowed" ? "Check out books" : "Add copies to stock"}</button>
        </form>
      </section>
      <section className="panel history-panel">
        <div className="panel-heading"><div><p className="eyebrow">PAPER TRAIL</p><h2>Transaction history <span className="count-badge">{transactions.length}</span></h2></div></div>
        {sortedTransactions.length ? <div className="history-list">{sortedTransactions.map((transaction) => <article className="history-row" key={transaction.id}>
          <div className="history-row__main"><strong>{transaction.bookTitle}</strong><span>{transaction.type} by {transaction.userName}</span></div>
          <div className="history-row__meta"><strong className={transaction.type === "Borrowed" || transaction.type === "Sold" ? "quantity-negative" : "quantity-positive"}>{transaction.type === "Borrowed" || transaction.type === "Sold" ? "−" : "+"}{transaction.quantity}</strong><span>{formatDate(transaction.date)}</span></div>
        </article>)}</div> : <EmptyState title="Nothing on the ledger yet" description="Your stock updates and checkouts will appear here." />}
      </section>
    </div>
  </>;
}
