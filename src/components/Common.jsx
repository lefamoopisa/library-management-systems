import { BookOpen } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, detail, tone = "sage" }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
      </div>
      <strong className="stat-card__value">{value}</strong>
      {detail && <span className="stat-card__detail">{detail}</span>}
    </article>
  );
}

export function EmptyState({ icon: Icon = BookOpen, title, description }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function RoleBadge({ role }) {
  return <span className={`role-badge ${role === "Librarian" ? "role-badge--librarian" : ""}`}>{role}</span>;
}
