import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import AppLayout from "./components/AppLayout.jsx";
import { apiRequest, jsonBody } from "./api.js";
import BooksPage from "./pages/BooksPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ShopPage from "./pages/ShopPage.jsx";
import SupplierOrdersPage from "./pages/SupplierOrdersPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import { readCachedBooks, saveCachedBooks } from "./utils/libraryCache.js";
import { readLegacyAccounts, readLegacyLibrary } from "./utils/legacyLibrary.js";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [books, setBooks] = useState(readCachedBooks);
  const [users, setUsers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [supplierOrders, setSupplierOrders] = useState([]);
  const [onlineCustomers, setOnlineCustomers] = useState([]);
  const [legacyData, setLegacyData] = useState(readLegacyLibrary);
  const [legacyUsers] = useState(readLegacyAccounts);
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const navigate = useNavigate();

  const loadLibraryData = useCallback(async (user) => {
    const requests = [
      apiRequest("/books"),
      apiRequest("/transactions"),
      apiRequest("/dashboard-summary"),
    ];
    if (user.role === "Librarian") requests.push(apiRequest("/users"), apiRequest("/supplier-orders"), apiRequest("/online-customers"));
    const [bookResult, transactionResult, summaryResult, userResult, orderResult, onlineResult] = await Promise.all(requests);
    setBooks(bookResult.books);
    setTransactions(transactionResult.transactions);
    setMemberCount(summaryResult.memberCount);
    setUsers(user.role === "Librarian" ? userResult.users : []);
    setSupplierOrders(user.role === "Librarian" ? orderResult.orders : []);
    setOnlineCustomers(user.role === "Librarian" ? onlineResult.customers : []);
  }, []);

  const initialize = useCallback(async () => {
    setIsReady(false);
    setBootError("");
    try {
      const { user } = await apiRequest("/auth/session");
      if (user) {
        await loadLibraryData(user);
        setCurrentUser(user);
        document.title = "Community Library";
      } else {
        setCurrentUser(null);
        document.title = "Sign in — Community Library";
      }
    } catch (error) {
      console.error("Could not connect to the library server.", error);
      setBootError(error.message || "Could not connect to the library server.");
    } finally {
      setIsReady(true);
    }
  }, [loadLibraryData]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    saveCachedBooks(books);
  }, [books]);

  async function acceptSession(user) {
    await loadLibraryData(user);
    setCurrentUser(user);
    setBootError("");
    document.title = "Community Library";
    navigate("/", { replace: true });
  }

  async function login(credentials) {
    const result = await apiRequest("/auth/login", { method: "POST", body: jsonBody(credentials) });
    await acceptSession(result.user);
  }

  async function register(account) {
    const result = await apiRequest("/auth/register", { method: "POST", body: jsonBody(account) });
    await acceptSession(result.user);
  }

  async function migrateLegacyAccount(account) {
    const { password, ...legacyCredentials } = account;
    const result = await apiRequest("/auth/migrate-member", {
      method: "POST",
      body: jsonBody({ ...legacyCredentials, password }),
    });
    await acceptSession(result.user);
  }

  async function importLegacyLibrary() {
    if (!window.confirm("Import the saved books, members, and transaction history from this browser? Matching book quantities will be updated from the saved browser copy.")) return;
    setIsImporting(true);
    setImportMessage("");
    try {
      const result = await apiRequest("/library/import", {
        method: "POST",
        body: jsonBody(legacyData),
      });
      try {
        window.localStorage.setItem("commonplace-backend-imported", "true");
      } catch (error) {
        console.error("The local import marker could not be saved.", error);
      }
      setLegacyData({ books: [], users: [], transactions: [] });
      await loadLibraryData(currentUser);
      const session = await apiRequest("/auth/session");
      setCurrentUser(session.user);
      setImportMessage(`Imported ${result.imported.books} books, ${result.imported.users} accounts, and ${result.imported.transactions} transactions.`);
    } catch (error) {
      console.error("Could not import the saved browser library.", error);
      setImportMessage(error.message || "Could not import the saved browser library.");
    } finally {
      setIsImporting(false);
    }
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setUsers([]);
    setTransactions([]);
    setSupplierOrders([]);
    setOnlineCustomers([]);
    document.title = "Sign in — Community Library";
    navigate("/login", { replace: true });
  }

  useEffect(() => {
    if (!currentUser) return undefined;
    let stopped = false;
    const pulse = async () => {
      try {
        await apiRequest("/presence", { method: "POST" });
        if (!stopped) setOnlineError("");
      } catch (error) {
        console.error("Could not update online presence.", error);
        if (!stopped) setOnlineError("Live customer status is temporarily unavailable.");
      }
    };
    pulse();
    const timer = window.setInterval(pulse, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role !== "Librarian") return undefined;
    let stopped = false;
    const refresh = async () => {
      try {
        const { customers } = await apiRequest("/online-customers");
        if (!stopped) {
          setOnlineCustomers(customers);
          setOnlineError("");
        }
      } catch (error) {
        console.error("Could not refresh online customers.", error);
        if (!stopped) setOnlineError("Live customer status is temporarily unavailable.");
      }
    };
    const timer = window.setInterval(refresh, 20_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  async function saveBook(book, editingId) {
    const result = await apiRequest(editingId ? `/books/${encodeURIComponent(editingId)}` : "/books", {
      method: editingId ? "PUT" : "POST",
      body: jsonBody(book),
    });
    setBooks((current) => editingId
      ? current.map((entry) => entry.id === editingId ? result.book : entry)
      : [result.book, ...current]);
  }

  async function deleteBook(bookId) {
    await apiRequest(`/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
    setBooks((current) => current.filter((entry) => entry.id !== bookId));
  }

  async function createTransaction(transaction) {
    const result = await apiRequest("/transactions", { method: "POST", body: jsonBody(transaction) });
    setBooks((current) => current.map((book) => book.id === result.book.id ? result.book : book));
    setTransactions((current) => [result.transaction, ...current]);
  }

  async function saveUser(user, editingId) {
    const result = await apiRequest(editingId ? `/users/${encodeURIComponent(editingId)}` : "/users", {
      method: editingId ? "PUT" : "POST",
      body: jsonBody(user),
    });
    setUsers((current) => editingId
      ? current.map((entry) => entry.id === editingId ? result.user : entry)
      : [result.user, ...current]);
    if (!editingId && user.role === "Member") setMemberCount((count) => count + 1);
  }

  async function deleteUser(userId) {
    await apiRequest(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
    const deleted = users.find((user) => user.id === userId);
    setUsers((current) => current.filter((user) => user.id !== userId));
    if (deleted?.role === "Member") setMemberCount((count) => Math.max(0, count - 1));
  }

  async function createSupplierOrder(order) {
    const result = await apiRequest("/supplier-orders", { method: "POST", body: jsonBody(order) });
    setSupplierOrders((current) => [result.order, ...current]);
    setBooks((current) => current.map((book) => book.id === order.bookId
      ? { ...book, supplierName: result.order.supplierName }
      : book));
  }

  async function receiveSupplierOrder(orderId) {
    const result = await apiRequest(`/supplier-orders/${encodeURIComponent(orderId)}/receive`, { method: "POST" });
    setSupplierOrders((current) => current.map((order) => order.id === orderId ? result.order : order));
    const [bookResult, transactionResult] = await Promise.all([apiRequest("/books"), apiRequest("/transactions")]);
    setBooks(bookResult.books);
    setTransactions(transactionResult.transactions);
  }

  const refreshAfterSale = useCallback(async () => {
    const [bookResult, transactionResult] = await Promise.all([apiRequest("/books"), apiRequest("/transactions")]);
    setBooks(bookResult.books);
    setTransactions(transactionResult.transactions);
  }, []);

  if (!isReady) return <main className="server-state"><p>Connecting to the library…</p></main>;
  if (bootError) return <main className="server-state"><p role="alert">{bootError}</p><button className="button button--primary" onClick={initialize}>Retry connection</button></main>;

  const librarianOnly = (element) => currentUser?.role === "Librarian" ? element : <Navigate to="/" replace />;
  const memberOnly = (element) => currentUser?.role === "Member" ? element : <Navigate to="/" replace />;

  return <Routes>
    <Route path="/login" element={<LoginPage legacyUsers={legacyUsers} currentUser={currentUser} onLogin={login} onRegister={register} onMigrateLegacy={migrateLegacyAccount} />} />
    <Route element={currentUser ? <AppLayout currentUser={currentUser} onLogout={logout} /> : <Navigate to="/login" replace />}>
      <Route index element={<DashboardPage books={books} memberCount={memberCount} transactions={transactions} onlineCustomers={onlineCustomers} onlineError={onlineError} isLibrarian={currentUser?.role === "Librarian"} hasLegacyData={legacyData.books.length + legacyData.users.length + legacyData.transactions.length > 0} onImportLegacy={importLegacyLibrary} importMessage={importMessage} isImporting={isImporting} />} />
      <Route path="books" element={<BooksPage books={books} onSave={saveBook} onDelete={deleteBook} canManage={currentUser?.role === "Librarian"} />} />
      <Route path="transactions" element={<TransactionsPage books={books} transactions={transactions} users={users} currentUser={currentUser} canManage={currentUser?.role === "Librarian"} onSubmitTransaction={createTransaction} />} />
      <Route path="shop" element={memberOnly(<ShopPage books={books} currentUser={currentUser} onSaleConfirmed={refreshAfterSale} />)} />
      <Route path="suppliers" element={librarianOnly(<SupplierOrdersPage books={books} orders={supplierOrders} onCreateOrder={createSupplierOrder} onReceiveOrder={receiveSupplierOrder} />)} />
      <Route path="users" element={librarianOnly(<UsersPage users={users} currentUser={currentUser} onSave={saveUser} onDelete={deleteUser} />)} />
    </Route>
    <Route path="*" element={<Navigate to={currentUser ? "/" : "/login"} replace />} />
  </Routes>;
}
