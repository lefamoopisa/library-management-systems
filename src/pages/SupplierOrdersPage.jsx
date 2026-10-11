import { useState } from "react";
import { EmptyState, PageHeader } from "../components/Common.jsx";

function formatAmount(cents) {
  return `M${(cents / 100).toFixed(2)}`;
}

export default function SupplierOrdersPage({ books, orders, onCreateOrder, onReceiveOrder }) {
  const [bookId, setBookId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedBook = books.find((book) => book.id === bookId);
  const supplierName = selectedBook?.supplierName ?? "";
  const orderTotalCents = Number(quantity) * 2035;

  async function createOrder(event) {
    event.preventDefault();
    if (!bookId || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 9999) {
      setError("Choose a book and enter a valid quantity.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreateOrder({
        bookId,
        quantity: Number(quantity),
      });
      setBookId("");
      setQuantity("1");
      setError("");
    } catch (cause) {
      setError(cause.message || "Could not create the supplier order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function receiveOrder(order) {
    setBusyOrderId(order.id);
    setError("");
    try {
      await onReceiveOrder(order.id);
    } catch (cause) {
      setError(cause.message || "Could not receive the supplier order.");
    } finally {
      setBusyOrderId("");
    }
  }

  return <>
    <PageHeader eyebrow="LIBRARY PROCUREMENT" title="Suppliers" description="Record supplier orders and stock received from suppliers." />
    <section className="panel supplier-form-panel">
      <div className="panel-heading"><div><p className="eyebrow">NEW PURCHASE ORDER</p><h2>Order books from a supplier</h2></div></div>
      <form className="form-grid" onSubmit={createOrder}>
        <label>Book<select value={bookId} onChange={(event) => setBookId(event.target.value)} required><option value="">Choose a title</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
        <label>Supplier name<input value={supplierName} readOnly placeholder="Choose a book to see its supplier" /></label>
        <label>Quantity<input type="number" min="1" max="9999" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label>Total cost<input value={formatAmount(orderTotalCents)} readOnly /></label>
        {error && <p className="form-error field-span-2" role="alert">{error}</p>}
        <div className="form-actions field-span-2"><button className="button button--primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving order…" : "Place purchase order"}</button></div>
      </form>
      <p className="supplier-note">Supplier cost is fixed at M20.35 per book; total cost updates automatically with quantity. Receiving an order adds its copies to available inventory. Supplier payments are handled separately.</p>
    </section>
    <section className="panel supplier-orders-panel">
      <div className="list-toolbar"><div><p className="eyebrow">PROCUREMENT HISTORY</p><h2>Supplier orders <span className="count-badge">{orders.length}</span></h2></div></div>
      {orders.length
        ? <div className="supplier-order-list">{orders.map((order) => {
          const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitCostCents, 0);
          return <article className="supplier-order" key={order.id}>
            <div className="supplier-order__heading"><div><strong>{order.supplierName}</strong><span>{order.createdBy} · {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(order.createdAt))}</span></div><span className={`order-status${order.status === "Received" ? " order-status--received" : ""}`}>{order.status}</span></div>
            <div className="supplier-order__item"><span>{order.items.map((item) => `${item.bookTitle} × ${item.quantity}`).join(", ")}</span><strong>{formatAmount(total)}</strong></div>
            {order.receivedAt && <p className="supplier-note">Received {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.receivedAt))}</p>}
            {order.status === "Ordered" && <button className="button button--small button--quiet" onClick={() => receiveOrder(order)} disabled={busyOrderId === order.id}>{busyOrderId === order.id ? "Receiving…" : "Mark as received"}</button>}
          </article>;
        })}</div>
        : <EmptyState title="No supplier orders yet" description="Place a purchase order above to keep your collection in stock." />}
    </section>
  </>;
}
