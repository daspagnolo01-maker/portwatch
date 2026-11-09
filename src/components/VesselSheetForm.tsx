"use client";

import { useState } from "react";
import type { VesselProfileRow, VesselRow } from "@/lib/repo/vessels";
import { CARGO_TYPE_OPTIONS, TRANSPORT_MODE_OPTIONS } from "@/lib/shipTypes";

interface Props {
  vessel: VesselRow;
  profile: VesselProfileRow | undefined;
}

type Tab = "identificativi" | "operativo" | "merci";

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function VesselSheetForm({ vessel, profile }: Props) {
  const [tab, setTab] = useState<Tab>("identificativi");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: vessel.name ?? "",
    imo: vessel.imo ?? "",
    callsign: vessel.callsign ?? "",
    flag_country: vessel.flag_country ?? "",
    owner: vessel.owner ?? "",
    operator: vessel.operator ?? "",
    company: vessel.company ?? "",
    gt: vessel.gt ?? "",
    dwt: vessel.dwt ?? "",
    year_built: vessel.year_built ?? "",
    length_m: vessel.length_m ?? "",
    beam_m: vessel.beam_m ?? "",
    note: vessel.note ?? "",
    usual_routes: profile?.usual_routes ?? "",
    frequent_ports: profile?.frequent_ports ?? "",
    usual_origins: profile?.usual_origins ?? "",
    usual_destinations: profile?.usual_destinations ?? "",
    call_frequency: profile?.call_frequency ?? "",
    cargo_description: profile?.cargo_description ?? "",
    hs_codes: profile?.hs_codes ?? "",
    transport_mode: profile?.transport_mode ?? "",
    cargo_particulars: profile?.cargo_particulars ?? "",
    operator_notes: profile?.operator_notes ?? "",
  });

  const [cargoTypes, setCargoTypes] = useState<string[]>(parseList(profile?.cargo_types));
  const [customCargo, setCustomCargo] = useState("");

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleCargo = (value: string) =>
    setCargoTypes((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const addCustomCargo = () => {
    const value = customCargo.trim();
    if (!value) return;
    if (!cargoTypes.includes(value)) setCargoTypes((current) => [...current, value]);
    setCustomCargo("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/vessels/${vessel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel: {
            name: form.name,
            imo: form.imo,
            callsign: form.callsign,
            flag_country: form.flag_country,
            owner: form.owner,
            operator: form.operator,
            company: form.company,
            gt: form.gt === "" ? null : Number(form.gt),
            dwt: form.dwt === "" ? null : Number(form.dwt),
            year_built: form.year_built === "" ? null : Number(form.year_built),
            length_m: form.length_m === "" ? null : Number(form.length_m),
            beam_m: form.beam_m === "" ? null : Number(form.beam_m),
            note: form.note,
          },
          profile: {
            cargo_types: cargoTypes,
            cargo_description: form.cargo_description,
            hs_codes: form.hs_codes,
            transport_mode: form.transport_mode,
            cargo_particulars: form.cargo_particulars,
            usual_routes: form.usual_routes,
            frequent_ports: form.frequent_ports,
            usual_origins: form.usual_origins,
            usual_destinations: form.usual_destinations,
            call_frequency: form.call_frequency,
            operator_notes: form.operator_notes,
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Salvataggio non riuscito");
      setMessage("Scheda nave salvata.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "identificativi"}
          className={`tab${tab === "identificativi" ? " active" : ""}`}
          onClick={() => setTab("identificativi")}
        >
          Dati identificativi
        </button>
        <button
          role="tab"
          aria-selected={tab === "operativo"}
          className={`tab${tab === "operativo" ? " active" : ""}`}
          onClick={() => setTab("operativo")}
        >
          Dati operativi
        </button>
        <button
          role="tab"
          aria-selected={tab === "merci"}
          className={`tab${tab === "merci" ? " active" : ""}`}
          onClick={() => setTab("merci")}
        >
          Merci e dogana
        </button>
      </div>

      <div className="card-body">
        {tab === "identificativi" && (
          <div className="stack">
            <div className="cols-even">
              <div className="field">
                <label className="field-label" htmlFor="v-name">
                  Nome nave
                </label>
                <input id="v-name" className="input" value={form.name} onChange={(event) => set("name", event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-imo">
                  IMO
                </label>
                <input
                  id="v-imo"
                  className="input mono"
                  value={form.imo}
                  onChange={(event) => set("imo", event.target.value)}
                  placeholder="7 cifre"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-mmsi">
                  MMSI (identificativo AIS)
                </label>
                <input id="v-mmsi" className="input mono" value={vessel.mmsi} readOnly disabled />
                <span className="field-hint">Chiave di riconoscimento automatico, non modificabile.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-call">
                  Call sign
                </label>
                <input id="v-call" className="input mono" value={form.callsign} onChange={(event) => set("callsign", event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-flag">
                  Bandiera
                </label>
                <input
                  id="v-flag"
                  className="input"
                  value={form.flag_country}
                  onChange={(event) => set("flag_country", event.target.value)}
                  placeholder="Paese di bandiera"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-type">
                  Tipologia AIS
                </label>
                <input id="v-type" className="input" value={vessel.ship_type_label ?? "—"} readOnly disabled />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-owner">
                  Armatore
                </label>
                <input id="v-owner" className="input" value={form.owner} onChange={(event) => set("owner", event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-operator">
                  Operatore / gestore
                </label>
                <input id="v-operator" className="input" value={form.operator} onChange={(event) => set("operator", event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-company">
                  Compagnia di navigazione
                </label>
                <input id="v-company" className="input" value={form.company} onChange={(event) => set("company", event.target.value)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-year">
                  Anno di costruzione
                </label>
                <input
                  id="v-year"
                  className="input mono"
                  type="number"
                  value={form.year_built as string}
                  onChange={(event) => set("year_built", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-gt">
                  Stazza lorda (GT)
                </label>
                <input
                  id="v-gt"
                  className="input mono"
                  type="number"
                  value={form.gt as string}
                  onChange={(event) => set("gt", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-dwt">
                  Portata (DWT)
                </label>
                <input
                  id="v-dwt"
                  className="input mono"
                  type="number"
                  value={form.dwt as string}
                  onChange={(event) => set("dwt", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-length">
                  Lunghezza (m)
                </label>
                <input
                  id="v-length"
                  className="input mono"
                  type="number"
                  step="0.1"
                  value={form.length_m as string}
                  onChange={(event) => set("length_m", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-beam">
                  Larghezza (m)
                </label>
                <input
                  id="v-beam"
                  className="input mono"
                  type="number"
                  step="0.1"
                  value={form.beam_m as string}
                  onChange={(event) => set("beam_m", event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="v-note">
                Annotazioni generali
              </label>
              <textarea
                id="v-note"
                className="textarea"
                value={form.note}
                onChange={(event) => set("note", event.target.value)}
                placeholder="Note sull'unità, contatti agente, particolarità operative…"
              />
            </div>
          </div>
        )}

        {tab === "operativo" && (
          <div className="stack">
            <div className="notice notice-accent">
              <strong>Storico operativo.</strong> Questi campi alimentano l&apos;intelligence sugli arrivi: la
              frequenza degli scali e le provenienze ricorrenti aiutano a prevedere il carico abituale, ma restano
              informazioni storiche.
            </div>
            <div className="cols-even">
              <div className="field">
                <label className="field-label" htmlFor="v-routes">
                  Rotte abituali
                </label>
                <textarea
                  id="v-routes"
                  className="textarea"
                  value={form.usual_routes}
                  onChange={(event) => set("usual_routes", event.target.value)}
                  placeholder="Es. Civitavecchia ↔ Termini Imerese"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-ports">
                  Porti frequentati
                </label>
                <textarea
                  id="v-ports"
                  className="textarea"
                  value={form.frequent_ports}
                  onChange={(event) => set("frequent_ports", event.target.value)}
                  placeholder="Elenco porti toccati abitualmente"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-origins">
                  Provenienze ricorrenti
                </label>
                <textarea
                  id="v-origins"
                  className="textarea"
                  value={form.usual_origins}
                  onChange={(event) => set("usual_origins", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-destinations">
                  Destinazioni abituali
                </label>
                <textarea
                  id="v-destinations"
                  className="textarea"
                  value={form.usual_destinations}
                  onChange={(event) => set("usual_destinations", event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-frequency">
                  Frequenza degli scali
                </label>
                <input
                  id="v-frequency"
                  className="input"
                  value={form.call_frequency}
                  onChange={(event) => set("call_frequency", event.target.value)}
                  placeholder="Es. settimanale, quindicinale…"
                />
              </div>
            </div>
            <p className="field-hint">
              Ultimi arrivi e partenze sono mostrati automaticamente nella colonna di destra, ricavati dagli scali
              registrati da AIS.
            </p>
          </div>
        )}

        {tab === "merci" && (
          <div className="stack">
            <div className="notice notice-warn">
              <strong>Dati storici, non carico corrente.</strong> Le informazioni merceologiche descrivono ciò che
              la nave trasporta abitualmente. Non sono una dichiarazione del carico del viaggio in corso:
              l&apos;operatore deve confermarle o modificarle sulla base della documentazione effettiva
              (manifesto, polizze di carico, fatture).
            </div>

            <div className="field">
              <span className="field-label">Tipologie di merce abituali</span>
              <div className="tag-list">
                {CARGO_TYPE_OPTIONS.map((option) => {
                  const active = cargoTypes.includes(option);
                  return (
                    <button
                      type="button"
                      key={option}
                      className="tag"
                      onClick={() => toggleCargo(option)}
                      style={{
                        cursor: "pointer",
                        borderColor: active ? "rgba(34,211,238,0.55)" : undefined,
                        background: active ? "rgba(34,211,238,0.13)" : undefined,
                        color: active ? "#a5f3fc" : undefined,
                      }}
                      aria-pressed={active}
                    >
                      {active ? "✓ " : ""}
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  className="input"
                  placeholder="Aggiungi tipologia personalizzata…"
                  value={customCargo}
                  onChange={(event) => setCustomCargo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomCargo();
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button className="btn" type="button" onClick={addCustomCargo}>
                  Aggiungi
                </button>
              </div>
              {cargoTypes.filter((value) => !CARGO_TYPE_OPTIONS.includes(value as (typeof CARGO_TYPE_OPTIONS)[number])).length > 0 && (
                <div className="tag-list" style={{ marginTop: 8 }}>
                  {cargoTypes
                    .filter((value) => !CARGO_TYPE_OPTIONS.includes(value as (typeof CARGO_TYPE_OPTIONS)[number]))
                    .map((value) => (
                      <button
                        type="button"
                        key={value}
                        className="tag"
                        onClick={() => toggleCargo(value)}
                        title="Rimuovi"
                      >
                        {value} ✕
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="cols-even">
              <div className="field">
                <label className="field-label" htmlFor="v-cargo-desc">
                  Descrizione delle merci
                </label>
                <textarea
                  id="v-cargo-desc"
                  className="textarea"
                  value={form.cargo_description}
                  onChange={(event) => set("cargo_description", event.target.value)}
                  placeholder="Es. cemento sfuso in stiva, pallets di ceramica…"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-hs">
                  Codici HS conosciuti
                </label>
                <textarea
                  id="v-hs"
                  className="textarea"
                  value={form.hs_codes}
                  onChange={(event) => set("hs_codes", event.target.value)}
                  placeholder="Es. 2523 29 00, 6907 21 00"
                />
                <span className="field-hint">Facoltativi: indicare solo codici documentati.</span>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-transport">
                  Tipologia di trasporto
                </label>
                <select
                  id="v-transport"
                  className="select"
                  value={form.transport_mode}
                  onChange={(event) => set("transport_mode", event.target.value)}
                >
                  <option value="">Non specificata</option>
                  {TRANSPORT_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="v-particulars">
                  Particolarità del carico
                </label>
                <textarea
                  id="v-particulars"
                  className="textarea"
                  value={form.cargo_particulars}
                  onChange={(event) => set("cargo_particulars", event.target.value)}
                  placeholder="Es. merce pericolosa IMDG classe 8, carico in transito…"
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="v-op-notes">
                Annotazioni dell&apos;operatore (controlli da predisporre)
              </label>
              <textarea
                id="v-op-notes"
                className="textarea"
                value={form.operator_notes}
                onChange={(event) => set("operator_notes", event.target.value)}
                placeholder="Es. verificare certificato fitosanitario, richiedere scansione container…"
              />
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva scheda"}
          </button>
          {message && <span style={{ color: "var(--green)", fontSize: 12 }}>{message}</span>}
          {error && <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span>}
          <span className="spacer" />
          <span className="field-hint">
            Ultimo aggiornamento anagrafica: {vessel.updated_at ? new Date(vessel.updated_at).toLocaleString("it-IT") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
