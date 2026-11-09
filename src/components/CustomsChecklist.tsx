"use client";

import { useState } from "react";
import type { CustomsItemRow, CustomsOperationWithItems, CustomsStatus } from "@/lib/repo/customs";
import type { ChecklistCategory } from "@/lib/customsTemplates";

const CATEGORY_LABEL: Record<ChecklistCategory, string> = {
  documento: "Documenti da acquisire",
  merce: "Documentazione merci",
  controllo: "Controlli da effettuare",
  operativo: "Note operative",
};

const CATEGORY_ORDER: ChecklistCategory[] = ["documento", "merce", "controllo", "operativo"];

const STATUS_OPTIONS: { value: CustomsStatus; label: string }[] = [
  { value: "draft", label: "Bozza" },
  { value: "in_progress", label: "In preparazione" },
  { value: "ready", label: "Pronta" },
  { value: "closed", label: "Chiusa" },
];

export function CustomsChecklist({ operation }: { operation: CustomsOperationWithItems }) {
  const [items, setItems] = useState<CustomsItemRow[]>(operation.items);
  const [status, setStatus] = useState<CustomsStatus>(operation.status);
  const [notes, setNotes] = useState(operation.notes ?? "");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState<ChecklistCategory>("documento");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = items.filter((item) => item.done === 1).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);
  const missingRequired = items.filter((item) => item.required === 1 && item.done === 0);

  const patch = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/customs/${operation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string; operation?: CustomsOperationWithItems };
      if (!response.ok) throw new Error(payload.error ?? "Aggiornamento non riuscito");
      if (payload.operation) {
        setItems(payload.operation.items);
        setStatus(payload.operation.status);
        setNotes(payload.operation.notes ?? "");
      }
      setMessage("Salvato.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (item: CustomsItemRow) => {
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, done: entry.done === 1 ? 0 : 1 } : entry)),
    );
    void patch({ item: { id: item.id, done: item.done !== 1 } }, `item-${item.id}`);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <span className="card-title">Checklist operativa</span>
          <span className="spacer" />
          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {done}/{items.length} · {percent}%
          </span>
        </div>
        <div className="card-body">
          <div className="bar" style={{ marginBottom: 10 }}>
            <div className="bar-fill" style={{ width: `${percent}%` }} />
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            <span className="field-label" style={{ marginRight: 4 }}>
              Stato pratica
            </span>
            <select
              className="select"
              value={status}
              onChange={(event) => {
                const value = event.target.value as CustomsStatus;
                setStatus(value);
                void patch({ status: value }, "status");
              }}
              style={{ width: 180 }}
              disabled={busy === "status"}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="spacer" />
            {missingRequired.length > 0 ? (
              <span className="chip chip-warning">{missingRequired.length} voci obbligatorie mancanti</span>
            ) : (
              <span className="chip chip-ok">nessuna voce obbligatoria mancante</span>
            )}
          </div>

          {CATEGORY_ORDER.map((category) => {
            const group = items.filter((item) => item.category === category);
            if (group.length === 0) return null;
            return (
              <div key={category} style={{ marginBottom: 14 }}>
                <div className="field-label" style={{ marginBottom: 4 }}>
                  {CATEGORY_LABEL[category]}
                </div>
                {group.map((item) => (
                  <div className={`checklist-item${item.done === 1 ? " done" : ""}`} key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done === 1}
                      onChange={() => toggle(item)}
                      disabled={busy === `item-${item.id}`}
                      aria-label={item.label}
                    />
                    <span style={{ flex: 1 }}>
                      <span className="checklist-label">
                        {item.label}
                        {item.required === 1 && (
                          <span style={{ color: "var(--amber)", fontSize: 10, marginLeft: 6 }}>obbligatorio</span>
                        )}
                      </span>
                      {item.note && <div className="checklist-note">{item.note}</div>}
                      {item.done_at && (
                        <div className="checklist-note">
                          completato {new Date(item.done_at).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}
                        </div>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          <div className="row" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <input
              className="input"
              placeholder="Aggiungi voce alla checklist…"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            />
            <select
              className="select"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as ChecklistCategory)}
              style={{ width: 170 }}
              aria-label="Categoria nuova voce"
            >
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABEL[category]}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!newLabel.trim() || busy === "add"}
              onClick={async () => {
                await patch({ addItem: { label: newLabel, category: newCategory } }, "add");
                setNewLabel("");
              }}
            >
              Aggiungi
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Note operative</span>
        </div>
        <div className="card-body">
          <textarea
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Annotare contatti agente, verifiche richieste, criticità della partita…"
            style={{ minHeight: 130 }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => patch({ notes }, "notes")} disabled={busy === "notes"}>
              {busy === "notes" ? "Salvo…" : "Salva note"}
            </button>
            {message && <span style={{ color: "var(--green)", fontSize: 11.5 }}>{message}</span>}
            {error && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
