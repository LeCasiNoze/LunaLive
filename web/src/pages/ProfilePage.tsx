import type { User } from "../lib/types";

export default function ProfilePage({ user }: { user: User | null }) {
  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Profil</h1>
        {user ? (
          <p className="muted">
            Connecté en tant que <b>{user.username}</b> — rubis:{" "}
            <b>{user.rubis.toLocaleString("fr-FR")}</b>.
          </p>
        ) : (
          <p className="muted">Non connecté.</p>
        )}
      </div>
    </main>
  );
}
