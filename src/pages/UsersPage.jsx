import { useState } from "react";
import { UserRoundPlus, Users, X } from "lucide-react";
import { EmptyState, PageHeader } from "../components/Common.jsx";

const emptyUser = { name: "", membershipId: "", role: "Member" };

export default function UsersPage({ users, currentUser, onSave, onDelete }) {
  const [form, setForm] = useState(emptyUser);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  function closeForm() {
    setForm(emptyUser);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }
  const [isSaving, setIsSaving] = useState(false);
  async function submitUser(event) {
    event.preventDefault();
    const membershipId = form.membershipId.trim().toUpperCase();
    const updatedUser = { ...form, name: form.name.trim(), membershipId };
    setIsSaving(true);
    try {
      await onSave(updatedUser, editingId);
      closeForm();
    } catch (cause) {
      setError(cause.message || "Could not save the account.");
    } finally {
      setIsSaving(false);
    }
  }
  function startEditing(user) {
    setForm({ name: user.name, membershipId: user.membershipId, role: user.role });
    setEditingId(user.id);
    setShowForm(true);
    setError("");
  }
  function deleteUser(user) {
    if (user.id === currentUser.id) {
      setError("You can't remove the account you're currently using.");
      return;
    }
    const otherLibrarians = users.filter((entry) => entry.role === "Librarian" && entry.id !== user.id);
    if (user.role === "Librarian" && otherLibrarians.length === 0) {
      setError("At least one librarian account must remain.");
      return;
    }
    if (!window.confirm(`Remove account ${user.membershipId}?`)) return;
    onDelete(user.id).then(() => setError("")).catch((cause) => setError(cause.message || "Could not remove this account."));
  }

  return <>
    <PageHeader eyebrow="YOUR COMMUNITY" title="Members" description="Manage library accounts and keep your community connected."
      action={<button className="button button--primary" onClick={() => { setForm(emptyUser); setEditingId(null); setError(""); setShowForm(true); }}><UserRoundPlus size={17} /> Add a member</button>} />
    {showForm && <section className="panel user-form-panel">
      <div className="panel-heading"><div><p className="eyebrow">{editingId ? "EDIT ACCOUNT" : "NEW ACCOUNT"}</p><h2>{editingId ? "Update member details" : "Add a member"}</h2></div><button className="icon-button" onClick={closeForm} aria-label="Close form"><X size={18} /></button></div>
      <form className="form-grid" onSubmit={submitUser}>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={100} /></label>
        <label>Membership ID<input value={form.membershipId} onChange={(event) => setForm({ ...form, membershipId: event.target.value })} required maxLength={24} placeholder="e.g. MEM-314" /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option>Member</option><option>Librarian</option></select></label>
        {error && <p className="form-error field-span-2" role="alert">{error}</p>}
        <div className="form-actions field-span-2"><button type="button" className="button button--quiet" onClick={closeForm}>Cancel</button><button className="button button--primary" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : editingId ? "Save changes" : "Create account"}</button></div>
      </form>
    </section>}
    {!showForm && error && <p className="form-error page-alert" role="alert">{error}</p>}
    <section className="panel">
      <div className="list-toolbar"><div><p className="eyebrow">MEMBER DIRECTORY</p><h2>Library accounts <span className="count-badge">{users.length}</span></h2></div><span className="directory-caption"><Users size={16} /> {users.filter((user) => user.role === "Member").length} members</span></div>
      {users.length ? <div className="table-wrap table-wrap--cards"><table className="directory-table directory-table--accounts">
        <thead><tr><th>MEMBERSHIP ID</th><th className="actions-column">ACTIONS</th></tr></thead>
        <tbody>{users.map((user) => <tr key={user.id}>
          <td data-label="Membership ID" className="membership-cell">{user.membershipId}</td>
          <td data-label="Actions"><div className="row-actions"><button className="button button--small button--quiet" onClick={() => startEditing(user)}>Update</button><button className="button button--small button--danger-quiet" onClick={() => deleteUser(user)}>Delete</button></div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState icon={Users} title="No accounts yet" description="Add a member or librarian to start growing your community." />}
    </section>
  </>;
}
