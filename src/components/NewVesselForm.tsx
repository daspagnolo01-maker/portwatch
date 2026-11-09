"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewVesselForm() {
  const router = useRouter();
  const [mmsi, setMmsi] = useState("");
  const [name, setName] = useState("");
  const [imo, setImo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vessels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mmsi, name, imo }),
      });
      const payload = (await response.json()) as { error?: string; vessel?: { id: number } };
      if (!response.ok) throw new Error(payload.error ?? "Creazione non riuscita");
      if (payload.vessel) router.push(`/navi/${payload.vessel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="card" style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", padding: "11px 14px", fontSize: 12.5, color: "var(--muted)" }}>
        Censimento manuale di una nave (senza segnale AIS)
      </summary>
      <div className="card-body">
        <div className="filters" style={{ border: "none", padding: 0, background: "transparent" }}>
          <div className="field">
            <label className="field-label" htmlFor="new-mmsi">
              MMSI (9 cifre) *
            </label>
            <input
              id="new-mmsi"
              className="input mono"
              value={mmsi}
              onChange={(event) => setMmsi(event.target.value)}
              placeholder="247000000"
            />
          </div>
          <div className="field grow">
            <label className="field-label" htmlFor="new-name">
              Nome nave
            </label>
            <input id="new-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="new-imo">
              IMO
            </label>
            <input
              id="new-imo"
              className="input mono"
              value={imo}
              onChange={(event) => setImo(event.target.value)}
              placeholder="opzionale"
            />
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? "Creo…" : "Censisci nave"}
          </button>
        </div>
        {error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <p className="field-hint" style={{ marginTop: 8 }}>
          Se esiste già una nave con lo stesso MMSI o IMO, viene aperta la scheda esistente senza duplicati.
        </p>
      </div>
    </details>
  );
}
