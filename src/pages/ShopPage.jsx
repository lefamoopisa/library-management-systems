import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { EmptyState, PageHeader } from "../components/Common.jsx";

function formatAmount(cents) {
  return `M${(cents / 100).toFixed(2)}`;
}

export default function ShopPage({ books, currentUser, onSaleConfirmed }) {
  const [cart, setCart] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPaymentPage, setShowPaymentPage] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [completedTotalCents, setCompletedTotalCents] = useState(0);
  const [demoAccountHolder, setDemoAccountHolder] = useState("");
  const [demoAccountNumber, setDemoAccountNumber] = useState("");
  const [demoExpiry, setDemoExpiry] = useState("");
  const [demoSecurityCode, setDemoSecurityCode] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedBooks = useMemo(() => books.filter((book) => cart[book.id]), [books, cart]);
  const totalCents = selectedBooks.reduce((sum, book) => sum + book.priceCents * cart[book.id], 0);

  useEffect(() => {
    const purchase = searchParams.get("purchase");
    if (purchase === "cancelled") {
      setNotice("Checkout was cancelled. Your basket is still here.");
      setSearchParams({}, { replace: true });
      return undefined;
    }
    const sessionId = searchParams.get("session_id");
    if (purchase !== "success" || !sessionId) return undefined;
    let active = true;
    let attempts = 0;
    const checkStatus = async () => {
      try {
        const result = await apiRequest(`/shop/purchase-status?sessionId=${encodeURIComponent(sessionId)}`);
        if (!active) return;
        if (result.status === "Paid") {
          setNotice("Payment received. Your book purchase is confirmed.");
          setCart({});
          await onSaleConfirmed();
          setSearchParams({}, { replace: true });
          return;
        }
        if (result.status === "Failed" || result.status === "Expired") {
          setNotice("The payment was not completed. You can try checkout again.");
          setSearchParams({}, { replace: true });
          return;
        }
        attempts += 1;
        if (attempts < 10) window.setTimeout(checkStatus, 2000);
        else setNotice("Payment is still being confirmed. Your order will update as soon as the payment provider notifies the library.");
      } catch (cause) {
        if (active) setError(cause.message || "Could not confirm the purchase.");
      }
    };
    checkStatus();
    return () => { active = false; };
  }, [searchParams, setSearchParams]);

  function updateCart(book, delta) {
    setError("");
    const quantity = (cart[book.id] ?? 0) + delta;
    if (quantity > book.quantity) {
      setError(`Only ${book.quantity} ${book.quantity === 1 ? "copy is" : "copies are"} available for ${book.title}.`);
      return;
    }
    const next = { ...cart };
    if (quantity < 1) delete next[book.id];
    else next[book.id] = quantity;
    setCart(next);
  }

  function openPaymentPage() {
    setError("");
    setNotice("");
    setPaymentComplete(false);
    setShowPaymentPage(true);
  }

  function completeDemoPayment(event) {
    event.preventDefault();
    setCompletedTotalCents(totalCents);
    setPaymentComplete(true);
    setDemoAccountNumber("");
    setDemoExpiry("");
    setDemoSecurityCode("");
  }

  if (showPaymentPage) {
    return <>
      <div className="payment-checkout">
        <div className="payment-checkout__top">
          <button className="payment-back" type="button" onClick={() => paymentComplete ? navigate("/") : setShowPaymentPage(false)}><ArrowLeft size={16} /> {paymentComplete ? "Return to library" : "Back to shop"}</button>
        </div>
        {paymentComplete ? <>
          <div className="payment-success-banner" role="status">
            <CheckCircle2 size={25} />
            <div><strong>Payment succesful</strong></div>
          </div>
          <section className="panel payment-receipt">
            <p className="eyebrow">COMMUNITY LIBRARY · DEMO RECEIPT</p>
            <h1>Payment complete</h1>
            <div className="payment-receipt__items">{selectedBooks.map((book) => <div className="payment-summary__item" key={book.id}>
              <span className="payment-summary__book"><strong>{book.title}</strong><small>Quantity {cart[book.id]}</small></span>
              <strong>{formatAmount(book.priceCents * cart[book.id])}</strong>
            </div>)}</div>
            <button className="button button--primary" type="button" onClick={() => navigate("/")}>Return to library</button>
          </section>
        </> : <>
          <header className="payment-checkout__heading">
            <p className="eyebrow">COMMUNITY LIBRARY · CHECKOUT</p>
            <h1>Complete your order</h1>
            <p>Review your books and enter sample payment information.</p>
          </header>
          <div className="payment-checkout__grid">
            <section className="panel payment-panel">
              <div className="payment-panel__heading">
                <span className="payment-step">1</span>
                <div><h2>Account payment</h2><p>Enter test values for this simulated checkout.</p></div>
              </div>
              <div className="payment-method payment-method--selected">
                <span className="payment-method__icon"><CreditCard size={20} /></span>
                <span><strong>Account details</strong><small>Simulation only · not connected to a bank</small></span>
                <CheckCircle2 className="payment-method__check" size={19} />
              </div>
              <form className="payment-form" onSubmit={completeDemoPayment}>
                <label>Sample account holder<input autoComplete="off" value={demoAccountHolder} onChange={(event) => setDemoAccountHolder(event.target.value)} placeholder="e.g. Sample Customer" required maxLength={80} /></label>
                <label>Sample account number<input autoComplete="off" inputMode="numeric" value={demoAccountNumber.replace(/(\d{4})(?=\d)/g, "$1 ")} onChange={(event) => setDemoAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 16))} placeholder="0000 0000 0000 0000" pattern="(?:[0-9]{4} ){1,3}[0-9]{2,4}" required /></label>
                <div className="payment-form__row">
                  <label>Expiry date<input autoComplete="off" inputMode="numeric" value={demoExpiry} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
                    setDemoExpiry(digits.length >= 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
                  }} placeholder="MM/YY" pattern="(0[1-9]|1[0-2])/[0-9]{2}" required /></label>
                  <label>Security code<input autoComplete="off" inputMode="numeric" value={demoSecurityCode} onChange={(event) => setDemoSecurityCode(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="3–4 digits" pattern="[0-9]{3,4}" required /></label>
                </div>
                <button className="button button--primary button--wide payment-submit" type="submit">Pay {formatAmount(totalCents)}</button>
              </form>
            </section>
            <aside className="panel payment-summary">
              <p className="eyebrow">ORDER SUMMARY</p>
              <h2>Your books</h2>
              <div className="payment-summary__items">{selectedBooks.map((book) => <div className="payment-summary__item" key={book.id}>
                <span className="payment-summary__bookmark"><CreditCard size={15} /></span>
                <span className="payment-summary__book"><strong>{book.title}</strong><small>Qty {cart[book.id]} · {formatAmount(book.priceCents)} each</small></span>
                <strong>{formatAmount(book.priceCents * cart[book.id])}</strong>
              </div>)}</div>
              <div className="payment-summary__total"><span>Total</span><strong>{formatAmount(totalCents)}</strong></div>
            </aside>
          </div>
        </>}
      </div>
    </>;
  }

  return <>
    <PageHeader eyebrow="BOOKSHOP" title="Shop books" description="Browse available books and manage your basket." />
    {notice && <p className="shop-notice" role="status">{notice}</p>}
    {error && <p className="form-error page-alert" role="alert">{error}</p>}
    {books.length
      ? <div className="shop-layout">
        <section className="shop-grid" aria-label="Books for sale">
          {books.map((book) => <article className="panel shop-book" key={book.id}>
            <div><span className="genre-pill">{book.genre}</span><h2>{book.title}</h2><p>{book.author}</p></div>
            <div className="shop-book__footer"><strong>{formatAmount(book.priceCents)}</strong><span>{book.quantity} available</span><span>{book.supplierName ? `Supplier: ${book.supplierName}` : "Supplier not listed"}</span></div>
            <button className="button button--primary button--wide" type="button" disabled={book.quantity < 1 || book.priceCents < 1 || currentUser.role !== "Member"} onClick={() => updateCart(book, 1)}>
              {currentUser.role !== "Member" ? "Member purchase only" : book.quantity < 1 ? "Out of stock" : book.priceCents < 1 ? "Price not set" : "Add to basket"}
            </button>
          </article>)}
        </section>
        <aside className="panel shop-cart">
          <div className="panel-heading"><div><p className="eyebrow">YOUR BASKET</p><h2>Book purchase</h2></div></div>
          {selectedBooks.length
            ? <div className="cart-list">{selectedBooks.map((book) => <div className="cart-item" key={book.id}>
              <div><strong>{book.title}</strong><span>{formatAmount(book.priceCents)} each</span></div>
              <div className="cart-item__quantity"><button type="button" aria-label={`Remove one ${book.title}`} onClick={() => updateCart(book, -1)}>−</button><span>{cart[book.id]}</span><button type="button" aria-label={`Add one ${book.title}`} onClick={() => updateCart(book, 1)}>+</button></div>
            </div>)}
              <div className="cart-total"><span>Total</span><strong>{formatAmount(totalCents)}</strong></div>
              <button className="button button--primary button--wide" type="button" onClick={openPaymentPage}>Proceed with payment</button>
            </div>
            : <EmptyState title="Your basket is empty" description="Add an available title to begin checkout." />}
        </aside>
      </div>
      : <EmptyState title="No books available to buy" description="Check back later for books available in the shop." />}
  </>;
}
