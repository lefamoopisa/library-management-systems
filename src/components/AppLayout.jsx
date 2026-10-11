import { LogOut } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { RoleBadge } from "./Common.jsx";

export default function AppLayout({ currentUser, onLogout }) {
  const isLibrarian = currentUser?.role === "Librarian";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span><strong>Community Library</strong></span>
        </NavLink>
        <p className="sidebar__section-label">LIBRARY</p>
        <nav className="sidebar__nav" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Overview</NavLink>
          <NavLink to="/books" className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Books</NavLink>
          {!isLibrarian && <NavLink to="/shop" className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Shop</NavLink>}
          <NavLink to="/transactions" className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Transactions</NavLink>
          {isLibrarian && <NavLink to="/suppliers" className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Suppliers</NavLink>}
          {isLibrarian && <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}>Members</NavLink>}
        </nav>
        <div className="sidebar__bottom">
          <div className="profile">
            <span className="avatar">{currentUser?.name?.charAt(0).toUpperCase()}</span>
            <div className="profile__info"><strong>{currentUser?.name}</strong><RoleBadge role={currentUser?.role} /></div>
            <button className="icon-button profile__logout" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="mobile-header">
          <div className="mobile-header__top">
            <NavLink to="/" className="brand"><strong>Community Library</strong></NavLink>
            <div className="mobile-account"><span className="mobile-user">{currentUser?.name}</span><button className="icon-button" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={16} /></button></div>
          </div>
          <nav className="mobile-nav" aria-label="Main navigation">
            <NavLink to="/" end className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Overview</NavLink>
            <NavLink to="/books" className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Books</NavLink>
            {!isLibrarian && <NavLink to="/shop" className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Shop</NavLink>}
            <NavLink to="/transactions" className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Transactions</NavLink>
            {isLibrarian && <NavLink to="/suppliers" className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Suppliers</NavLink>}
            {isLibrarian && <NavLink to="/users" className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}>Members</NavLink>}
          </nav>
        </header>
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
