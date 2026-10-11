import { ArrowRight, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, StatCard } from "../components/Common.jsx";

function formatDate(date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export default function DashboardPage({
  books, memberCount, transactions, onlineCustomers, onlineError, isLibrarian,
  hasLegacyData, onImportLegacy, importMessage, isImporting,
}) {
  const availableCopies = books.reduce((total, book) => total + book.quantity, 0);
  const lowStock = books.filter((book) => book.quantity < 2);
  const recentTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  return (
    <>
      <PageHeader eyebrow="YOUR COMMUNITY LIBRARY" action={<span className="header-chip"><span className="live-dot" /> Library is open</span>} />
      {hasLegacyData && isLibrarian && <section className="panel legacy-import-panel">
        <div><strong>Saved library data found in this browser</strong><p>Import its books, member list, and transaction history into the shared library database.</p></div>
        <button className="button button--primary" type="button" onClick={onImportLegacy} disabled={isImporting}>{isImporting ? "Importing…" : "Import saved data"}</button>
      </section>}
      {importMessage && <p className="import-result" role="status">{importMessage}</p>}
      <section className="stats-grid">
        <StatCard label="Titles in collection" value={books.length} />
        <StatCard label="Copies available" value={availableCopies} tone="peach" />
        <StatCard label="Registered members" value={memberCount} tone="lavender" />
        <StatCard label="Needs a restock" value={lowStock.length} tone="yellow" />
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Availability at a glance</h2></div><Link className="text-link" to="/books">All books <ArrowRight size={15} /></Link></div>
          {books.length ? <div className="table-wrap table-wrap--cards">
            <table>
              <thead><tr><th>BOOK</th><th>GENRE</th><th>AVAILABILITY</th></tr></thead>
              <tbody>{books.slice(0, 6).map((book) => <tr key={book.id}>
                <td data-label="Book"><div className="book-cell"><span><strong>{book.title}</strong><small>{book.author}</small></span></div></td>
                <td data-label="Genre"><span className="genre-pill">{book.genre}</span></td>
                <td data-label="Availability"><span className={`stock-status${book.quantity < 2 ? " stock-status--low" : ""}`}><i />{book.quantity === 0 ? "Out of stock" : `${book.quantity} ${book.quantity === 1 ? "copy" : "copies"}`}</span></td>
              </tr>)}</tbody>
            </table>
          </div> : <EmptyState title="Your shelves are waiting" description="Add your first book to start building the collection." />}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading"><div><p className="eyebrow">JUST IN</p><h2>Recent activity</h2></div><Link className="icon-link" to="/transactions" aria-label="View all transactions"><ArrowRight size={17} /></Link></div>
          {recentTransactions.length ? <div className="activity-list">{recentTransactions.map((transaction) => <article className="activity-item" key={transaction.id}>
            <div className="activity-item__body"><strong>{transaction.type === "Borrowed" ? "Book checked out" : transaction.type === "Sold" ? "Book sold" : transaction.details?.startsWith("Supplier:") ? "Supplier delivery received" : "New copies added"}</strong><span>{transaction.bookTitle}</span><small>{transaction.details ? `${transaction.userName} · ${transaction.details} · ` : `${transaction.userName} · `}{formatDate(transaction.date)}</small></div>
            <span className={`activity-quantity${transaction.type === "Borrowed" || transaction.type === "Sold" ? " activity-quantity--borrow" : ""}`}>{transaction.type === "Borrowed" || transaction.type === "Sold" ? "−" : "+"}{transaction.quantity}</span>
          </article>)}</div> : <EmptyState title="No activity yet" description="Book checkouts and stock updates will show up here." />}
        </section>
      </div>
      {isLibrarian && <section className="panel online-customers-panel">
        <div className="panel-heading"><div><p className="eyebrow">LIVE ACTIVITY</p><h2>Online members <span className="count-badge">{onlineCustomers.length}</span></h2></div><span className="header-chip"><span className="live-dot" /> Active now</span></div>
        {onlineError && <p className="form-error" role="alert">{onlineError}</p>}
        {onlineCustomers.length
          ? <div className="online-customer-list">{onlineCustomers.map((customer) => <article className="online-customer" key={customer.membershipId}>
            <span className="live-dot" />
            <strong>{customer.membershipId}</strong>
          </article>)}</div>
          : <p className="online-empty">No members are active right now. Only real signed-in members appear here.</p>}
      </section>}
    </>
  );
}
