"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Crea una pratica doganale per la nave (modello scelto in base alle merci). */
export function CreateOperationButton({
  vesselId,
  templateKey,
  label = "Crea pratica",
  defaultTitle,
}: {
  vesselId: number;
  templateKey?: string;
  label?: string;
  defaultTitle?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/customs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vesselId, templateKey, title: defaultTitle }),
      });
      const payload = (await response.json()) as { error?: string; operation?: { id: number } };
      if (!response.ok) throw new Error(payload.error ?? "Creazione non riuscita");
      if (payload.operation) router.push(`/dogana/${payload.operation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn btn-sm btn-primary" onClick={create} disabled={loading}>
        {loading ? "Creo…" : label}
      </button>
      {error && <span style={{ color: "var(--red)", fontSize: 11 }}>{error}</span>}
    </span>
  );
}
