"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Circle, CircleMarker, Map as LeafletMap, Marker, Polyline } from "leaflet";
import { CATEGORY_META, navStatusLabel, shipTypeInfo, type ShipCategory } from "@/lib/shipTypes";
import { cardinal, formatDistanceNm } from "@/lib/geo";
import type { LiveVessel } from "@/lib/repo/live";

interface AreaConfig {
  centerLat: number;
  centerLon: number;
  monitorRadiusNm: number;
  portRadiusM: number;
  approachRadiusNm: number;
  signalLossMinutes: number;
}

interface MapResponse {
  vessels: LiveVessel[];
  area: AreaConfig;
  port: { name: string; shortName: string; locode: string; lat: number; lon: number };
  connection: { state: string; lastMessageAt: string | null; error: string | null; messages: number; apiKeyConfigured: boolean } | null;
  serverTime: string;
}

const CONNECTION_LABELS: Record<string, string> = {
  connected: "AIS in ricezione",
  connecting: "Connessione al flusso AIS…",
  reconnecting: "Riconnessione al flusso AIS…",
  error: "Flusso AIS non disponibile",
  no_key: "Chiave API AISStream non configurata",
  idle: "Flusso AIS inattivo",
  stopped: "Flusso AIS fermo",
};

export function LiveMap({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<MapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyPort, setOnlyPort] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [areaDraft, setAreaDraft] = useState<AreaConfig | null>(null);
  const [savingArea, setSavingArea] = useState(false);
  const [areaMessage, setAreaMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Map<number, Marker>>(new Map());
  const overlayRef = useRef<{
    port?: Circle;
    approach?: Circle;
    monitor?: Circle;
    center?: CircleMarker;
  }>({});
  const trackRef = useRef<Polyline | null>(null);
  const areaKeyRef = useRef<string>("");
  const selectedRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/map?window=90", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as MapResponse;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  // Inizializzazione della mappa (Leaflet è importato solo lato client).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L as unknown as typeof import("leaflet");

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
        minZoom: 3,
        maxZoom: 17,
        worldCopyJump: true,
      }).setView([37.9860726, 13.7041999], 11);

      // Basemap raster OpenStreetMap reso scuro via CSS (classe `.map-tiles`):
      // le tile CARTO ora richiedono una chiave API e senza di essa mostrano la
      // filigrana "API KEY REQUIRED" sopra la mappa.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "map-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      map.on("click", () => {
        setSelectedId(null);
      });

      mapRef.current = map;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.clear();
      overlayRef.current = {};
      trackRef.current = null;
      setReady(false);
    };
  }, []);

  const selected = useMemo(
    () => data?.vessels.find((vessel) => vessel.id === selectedId) ?? null,
    [data, selectedId],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.vessels
      .filter((vessel) => (category ? vessel.ship_category === category : true))
      .filter((vessel) => (onlyPort ? vessel.inside_port === 1 || vessel.call_status === "IN_PORT" : true))
      .filter((vessel) => {
        if (!needle) return true;
        return (
          (vessel.name ?? "").toLowerCase().includes(needle) ||
          vessel.mmsi.includes(needle) ||
          (vessel.imo ?? "").includes(needle)
        );
      });
  }, [data, search, category, onlyPort]);

  // Cerchi dell'area monitorata (ridisegnati solo se la configurazione cambia).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !data || !ready) return;
    const key = JSON.stringify(data.area);
    if (areaKeyRef.current === key) return;
    areaKeyRef.current = key;

    if (overlayRef.current.port) map.removeLayer(overlayRef.current.port);
    if (overlayRef.current.approach) map.removeLayer(overlayRef.current.approach);
    if (overlayRef.current.monitor) map.removeLayer(overlayRef.current.monitor);
    if (overlayRef.current.center) map.removeLayer(overlayRef.current.center);

    const center: [number, number] = [data.area.centerLat, data.area.centerLon];

    overlayRef.current.monitor = L.circle(center, {
      radius: data.area.monitorRadiusNm * 1852,
      color: "#334e68",
      weight: 1,
      dashArray: "5 7",
      fill: false,
      interactive: false,
    }).addTo(map);

    overlayRef.current.approach = L.circle(center, {
      radius: data.area.approachRadiusNm * 1852,
      color: "#f59e0b",
      weight: 1,
      dashArray: "4 5",
      opacity: 0.6,
      fillColor: "#f59e0b",
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(map);

    overlayRef.current.port = L.circle(center, {
      radius: data.area.portRadiusM,
      color: "#ef4444",
      weight: 2,
      opacity: 0.85,
      fillColor: "#ef4444",
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(map);

    overlayRef.current.center = L.circleMarker(center, {
      radius: 4,
      color: "#22d3ee",
      weight: 2,
      fillColor: "#0b1220",
      fillOpacity: 1,
    })
      .bindTooltip("Centro area portuale monitorata", { direction: "top" })
      .addTo(map);

    if (!compact) map.setView(center, 10);
  }, [data, ready, compact]);

  // Marker delle navi (aggiornamento incrementale).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !data || !ready) return;

    const seen = new Set<number>();
    for (const vessel of filtered) {
      seen.add(vessel.id);
      const info = CATEGORY_META[(vessel.ship_category as ShipCategory) ?? "other"] ?? CATEGORY_META.other;
      const rotation = vessel.last_heading ?? vessel.last_cog ?? 0;
      const isSelected = vessel.id === selectedId;
      const size = isSelected ? 30 : vessel.inside_port === 1 ? 24 : 21;

      const icon = L.divIcon({
        className: `vessel-marker${isSelected ? " is-selected" : ""}`,
        html:
          `<span class="vessel-arrow${vessel.stale ? " is-stale" : ""}" style="transform:rotate(${rotation}deg)">` +
          `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
          `<path d="M12 1.8 L19 21 L12 16.6 L5 21 Z" fill="${info.color}" stroke="#040d15" stroke-width="1.1" stroke-linejoin="round"/>` +
          `</svg></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const existing = markersRef.current.get(vessel.id);
      if (existing) {
        existing.setLatLng([vessel.last_lat, vessel.last_lon]);
        existing.setIcon(icon);
        existing.setTooltipContent(tooltipHtml(vessel));
      } else {
        const marker = L.marker([vessel.last_lat, vessel.last_lon], {
          icon,
          title: vessel.name ?? vessel.mmsi,
          keyboard: false,
        });
        marker.bindTooltip(tooltipHtml(vessel), { direction: "top", offset: [0, -8], className: "vessel-tip" });
        marker.on("click", () => setSelectedId(vessel.id));
        marker.addTo(map);
        markersRef.current.set(vessel.id, marker);
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
      }
    }
  }, [data, filtered, selectedId, ready]);

  // Traccia delle ultime 12 ore per la nave selezionata.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;

    if (!selectedId) {
      if (trackRef.current) {
        map.removeLayer(trackRef.current);
        trackRef.current = null;
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/vessels/${selectedId}/positions?hours=12`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { track: { lat: number; lon: number }[] };
        if (cancelled || !mapRef.current) return;
        if (trackRef.current) {
          mapRef.current.removeLayer(trackRef.current);
          trackRef.current = null;
        }
        if (payload.track.length < 2) return;
        trackRef.current = L.polyline(
          payload.track.map((point) => [point.lat, point.lon] as [number, number]),
          { color: "#22d3ee", weight: 1.6, opacity: 0.65, dashArray: "2 4" },
        ).addTo(mapRef.current);
      } catch {
        /* traccia non disponibile: non blocca la mappa */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, ready]);

  // Pan verso la nave selezionata.
  useEffect(() => {
    if (!selected || !mapRef.current) return;
    if (selectedRef.current === selected.id) return;
    selectedRef.current = selected.id;
    mapRef.current.panTo([selected.last_lat, selected.last_lon], { animate: true, duration: 0.6 });
  }, [selected]);

  const applyArea = async () => {
    if (!areaDraft) return;
    setSavingArea(true);
    setAreaMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerLat: areaDraft.centerLat,
          centerLon: areaDraft.centerLon,
          monitorRadiusNm: areaDraft.monitorRadiusNm,
          portRadiusM: areaDraft.portRadiusM,
          approachRadiusNm: areaDraft.approachRadiusNm,
        }),
      });
      const payload = (await response.json()) as { error?: string; resubscribed?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Aggiornamento non riuscito");
      setAreaMessage(
        payload.resubscribed
          ? "Area aggiornata: nuovo ciclo AIS avviato sull'area selezionata."
          : "Area aggiornata.",
      );
      areaKeyRef.current = "";
      await load();
      mapRef.current?.setView([areaDraft.centerLat, areaDraft.centerLon], mapRef.current.getZoom());
    } catch (err) {
      setAreaMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingArea(false);
    }
  };

  const connectionState = data?.connection?.state ?? "idle";
  const showOverlay = connectionState !== "connected";

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <span className="card-title">Area di monitoraggio</span>
          <span className="spacer" />
          <span className="chip chip-muted">
            {data ? `${data.vessels.length} navi con segnale < 90 min` : "caricamento…"}
          </span>
          <button className="btn btn-sm" onClick={() => setPanelOpen((value) => !value)}>
            {panelOpen ? "Nascondi pannello" : "Mostra pannello"}
          </button>
        </div>
        {data && (
          <div className="card-body">
            <div className="filters" style={{ border: "none", padding: 0, background: "transparent" }}>
              <div className="field compact">
                <label className="field-label" htmlFor="area-lat">
                  Latitudine centro
                </label>
                <input
                  id="area-lat"
                  className="input mono"
                  type="number"
                  step="0.0001"
                  value={areaDraft?.centerLat ?? data.area.centerLat}
                  onChange={(event) =>
                    setAreaDraft({
                      ...(areaDraft ?? data.area),
                      centerLat: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="field compact">
                <label className="field-label" htmlFor="area-lon">
                  Longitudine centro
                </label>
                <input
                  id="area-lon"
                  className="input mono"
                  type="number"
                  step="0.0001"
                  value={areaDraft?.centerLon ?? data.area.centerLon}
                  onChange={(event) =>
                    setAreaDraft({
                      ...(areaDraft ?? data.area),
                      centerLon: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="field compact">
                <label className="field-label" htmlFor="area-radius">
                  Raggio monitor (mn)
                </label>
                <input
                  id="area-radius"
                  className="input mono"
                  type="number"
                  min={5}
                  max={200}
                  value={areaDraft?.monitorRadiusNm ?? data.area.monitorRadiusNm}
                  onChange={(event) =>
                    setAreaDraft({
                      ...(areaDraft ?? data.area),
                      monitorRadiusNm: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="field compact">
                <label className="field-label" htmlFor="area-port">
                  Raggio porto (m)
                </label>
                <input
                  id="area-port"
                  className="input mono"
                  type="number"
                  min={300}
                  max={10000}
                  step={100}
                  value={areaDraft?.portRadiusM ?? data.area.portRadiusM}
                  onChange={(event) =>
                    setAreaDraft({
                      ...(areaDraft ?? data.area),
                      portRadiusM: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div className="field compact">
                <label className="field-label" htmlFor="area-approach">
                  Avvicinamento (mn)
                </label>
                <input
                  id="area-approach"
                  className="input mono"
                  type="number"
                  min={2}
                  max={100}
                  value={areaDraft?.approachRadiusNm ?? data.area.approachRadiusNm}
                  onChange={(event) =>
                    setAreaDraft({
                      ...(areaDraft ?? data.area),
                      approachRadiusNm: Number(event.target.value),
                    })
                  }
                />
              </div>
              <button className="btn btn-primary" onClick={applyArea} disabled={savingArea || !areaDraft}>
                {savingArea ? "Applico…" : "Applica area"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setAreaDraft({
                    ...data.area,
                    centerLat: data.port.lat,
                    centerLon: data.port.lon,
                  });
                }}
              >
                Ripristina porto
              </button>
            </div>
            {areaMessage && (
              <div className="field-hint" style={{ marginTop: 8 }}>
                {areaMessage}
              </div>
            )}
            <div className="field-hint" style={{ marginTop: 8 }}>
              Il centro definisce sia l&apos;area richiesta al servizio AIS sia la geofence portuale.
              Modificando latitudine/longitudine il rilevamento ingressi e uscite si sposta di conseguenza.
            </div>
          </div>
        )}
      </div>

      <div className={`map-shell${panelOpen ? " has-panel" : ""}`}>
        <div ref={containerRef} className={`map-canvas${compact ? " short" : ""}`} role="application" aria-label="Mappa AIS del porto di Termini Imerese" />

        {showOverlay && (
          <div className="map-overlay">
            <div className="map-overlay-inner">
              <div className="map-overlay-title">Segnale AIS non disponibile</div>
              <div className="map-overlay-text">
                {CONNECTION_LABELS[connectionState] ?? "Stato sconosciuto"}.
                {data?.connection?.error ? ` ${data.connection.error}` : ""}
                <br />
                La mappa non mostra navi finché il flusso AIS non è attivo: nessun dato viene simulato.
              </div>
              {!data?.connection?.apiKeyConfigured && (
                <div className="map-overlay-text" style={{ fontSize: 11.5 }}>
                  Impostare <code>AISSTREAM_API_KEY</code> nel file <code>.env.local</code> del server e riavviare.
                </div>
              )}
              <div style={{ marginTop: 14 }} className="row">
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await fetch("/api/ais/reconnect", { method: "POST" });
                    load();
                  }}
                >
                  Forza riconnessione
                </button>
                <Link className="btn" href="/impostazioni">
                  Apri impostazioni
                </Link>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="map-overlay">
            <div className="map-overlay-inner">
              <div className="map-overlay-title">Errore di caricamento</div>
              <div className="map-overlay-text">{error}</div>
            </div>
          </div>
        )}

        <div className="map-legend">
          {(Object.keys(CATEGORY_META) as ShipCategory[])
            .filter((key) => key !== "other")
            .slice(0, 8)
            .map((key) => (
              <span className="map-legend-item" key={key}>
                <span className="dot" style={{ background: CATEGORY_META[key].color }} />
                {CATEGORY_META[key].label}
              </span>
            ))}
          <span className="map-legend-item">
            <span className="dot" style={{ background: "#ef4444" }} /> area porto
          </span>
          <span className="map-legend-item">
            <span className="dot" style={{ background: "#f59e0b" }} /> avvicinamento
          </span>
        </div>

        {panelOpen && (
          <div className="map-panel" style={compact ? { position: "absolute" } : undefined}>
            <div className="map-panel-head">
              <span className="card-title" style={{ fontSize: 11 }}>
                {selected ? "Nave selezionata" : "Navi nell'area"}
              </span>
              <span className="spacer" />
              {selected && (
                <button className="btn btn-sm btn-icon" onClick={() => setSelectedId(null)} aria-label="Chiudi dettaglio">
                  ✕
                </button>
              )}
            </div>

            {selected ? (
              <div className="map-panel-body">
                <div style={{ fontSize: 15, fontWeight: 600, color: "#f2f9ff" }}>
                  {selected.name ?? `MMSI ${selected.mmsi}`}
                </div>
                <div className="cell-sub" style={{ marginBottom: 10 }}>
                  {selected.imo ? `IMO ${selected.imo} · ` : ""}MMSI {selected.mmsi} ·{" "}
                  {selected.flag_country ?? "bandiera n.d."}
                </div>
                <dl className="kv">
                  <dt>Tipo</dt>
                  <dd>{selected.ship_type_label ?? shipTypeInfo(selected.ship_type_code).label}</dd>
                  <dt>Destinazione</dt>
                  <dd>{selected.destination_declared ?? "—"}</dd>
                  <dt>ETA</dt>
                  <dd>
                    {selected.call_eta
                      ? new Date(selected.call_eta).toLocaleString("it-IT", {
                          timeZone: "Europe/Rome",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : selected.eta_declared
                        ? new Date(selected.eta_declared).toLocaleString("it-IT", {
                            timeZone: "Europe/Rome",
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : selected.estimated_eta
                          ? `≈ ${new Date(selected.estimated_eta).toLocaleString("it-IT", {
                              timeZone: "Europe/Rome",
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })} (stimata)`
                          : "—"}
                  </dd>
                  <dt>Distanza</dt>
                  <dd>{formatDistanceNm(selected.distance_nm)} dal centro porto</dd>
                  <dt>Velocità</dt>
                  <dd className="mono">
                    {selected.last_sog !== null ? `${selected.last_sog.toFixed(1)} kn` : "—"}
                  </dd>
                  <dt>Rotta</dt>
                  <dd className="mono">
                    {selected.last_cog !== null ? `${Math.round(selected.last_cog)}° ${cardinal(selected.last_cog)}` : "—"}
                  </dd>
                  <dt>Stato</dt>
                  <dd>
                    {navStatusLabel(selected.nav_status)}
                    {selected.inside_port === 1 ? " · in area portuale" : ""}
                  </dd>
                  <dt>Ultimo AIS</dt>
                  <dd className="mono">
                    {selected.last_seen
                      ? new Date(selected.last_seen).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" })
                      : "—"}
                    {selected.stale ? " · segnale perso" : ""}
                  </dd>
                </dl>
                {safeCargo(selected.profile_cargo_types).length > 0 && (
                  <div className="notice notice-accent" style={{ marginTop: 10, fontSize: 11 }}>
                    <strong>Merci storiche:</strong> {safeCargo(selected.profile_cargo_types).join(", ")}
                    <div style={{ marginTop: 4, color: "var(--dim)" }}>
                      Dato indicativo: verificare con la documentazione del viaggio.
                    </div>
                  </div>
                )}
                <Link href={`/navi/${selected.id}`} className="btn btn-primary" style={{ marginTop: 10, width: "100%" }}>
                  Apri scheda nave
                </Link>
              </div>
            ) : (
              <>
                <div style={{ padding: 9, borderBottom: "1px solid var(--border)" }}>
                  <input
                    className="input"
                    placeholder="Cerca nome, MMSI o IMO…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="Cerca nave"
                  />
                  <div className="row" style={{ marginTop: 6 }}>
                    <select
                      className="select"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      aria-label="Filtra per tipologia"
                      style={{ flex: 1 }}
                    >
                      <option value="">Tutte le tipologie</option>
                      {(Object.keys(CATEGORY_META) as ShipCategory[]).map((key) => (
                        <option key={key} value={key}>
                          {CATEGORY_META[key].label}
                        </option>
                      ))}
                    </select>
                    <label className="row" style={{ gap: 5, fontSize: 11, color: "var(--muted)" }}>
                      <input
                        type="checkbox"
                        checked={onlyPort}
                        onChange={(event) => setOnlyPort(event.target.checked)}
                      />
                      in porto
                    </label>
                  </div>
                </div>
                <div className="map-panel-body" style={{ padding: 0 }}>
                  {filtered.length === 0 ? (
                    <div className="empty">
                      Nessuna nave con segnale AIS recente nell&apos;area monitorata.
                    </div>
                  ) : (
                    filtered.slice(0, 60).map((vessel) => {
                      const meta = CATEGORY_META[(vessel.ship_category as ShipCategory) ?? "other"] ?? CATEGORY_META.other;
                      return (
                        <div
                          key={vessel.id}
                          className="ship-row"
                          onClick={() => setSelectedId(vessel.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") setSelectedId(vessel.id);
                          }}
                        >
                          <span className="dot" style={{ background: meta.color, opacity: vessel.stale ? 0.4 : 1 }} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span className="ship-row-name" style={{ display: "block" }}>
                              {vessel.name ?? `MMSI ${vessel.mmsi}`}
                            </span>
                            <span className="ship-row-meta">
                              {vessel.mmsi} · {vessel.last_sog !== null ? `${vessel.last_sog.toFixed(1)} kn` : "—"} ·{" "}
                              {formatDistanceNm(vessel.distance_nm)}
                            </span>
                          </span>
                          {vessel.call_status === "IN_PORT" && <span className="chip chip-ok">in porto</span>}
                          {vessel.call_status === "EXPECTED" && <span className="chip chip-warning">attesa</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function tooltipHtml(vessel: LiveVessel): string {
  const name = vessel.name ?? `MMSI ${vessel.mmsi}`;
  const sog = vessel.last_sog !== null ? `${vessel.last_sog.toFixed(1)} kn` : "vel. n.d.";
  return `<strong>${escapeHtml(name)}</strong><br/><span style="font-family:monospace;font-size:10px">${vessel.mmsi} · ${sog}</span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeCargo(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
