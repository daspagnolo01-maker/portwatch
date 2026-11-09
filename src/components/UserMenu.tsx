"use client";

import { SignInWithFreebuff, SignOutButton, useFreebuffUser } from "@freebuff/auth/react";

/**
 * Nome dell'utente collegato e uscita. Solo presentazione: l'accesso è deciso
 * dal proxy sul server, non da questo componente.
 */
export function UserMenu() {
  const { user, isLoading } = useFreebuffUser();

  if (isLoading) return null;

  if (!user) {
    return (
      <SignInWithFreebuff returnTo="/" className="btn btn-sm">
        Accedi
      </SignInWithFreebuff>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span
        style={{ fontSize: 11, color: "var(--dim)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={user.email ?? user.name ?? "utente collegato"}
      >
        {user.name ?? user.email ?? "operatore"}
      </span>
      <SignOutButton className="btn btn-sm">Esci</SignOutButton>
    </span>
  );
}
