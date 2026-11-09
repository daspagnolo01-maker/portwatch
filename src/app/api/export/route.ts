import { NextResponse } from "next/server";
import { buildXlsx, excelFileName, type SheetSpec } from "@/lib/xlsx";
import { listCalls, type CallKind } from "@/lib/repo/calls";
import { listVesselCards } from "@/lib/repo/vessels";
import { listEvents } from "@/lib/repo/events";
import { all } from "@/lib/db";
import { listOperations, operationProgress } from "@/lib/repo/customs";
import { formatDateTime } from "@/lib/time";
import { navStatusLabel } from "@/lib/shipTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATASETS = ["attese", "arrivi", "partenze", "in-porto", "navi", "eventi", "posizioni", "dogana"] as const;
type Dataset = (typeof DATASETS)[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = (url.searchParams.get("dataset") ?? "attese") as Dataset;
  const dataset: Dataset = DATASETS.includes(requested) ? requested : "attese";

  const filters = {
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    origin: url.searchParams.get("origin") ?? undefined,
    destination: url.searchParams.get("destination") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  let sheet: SheetSpec;
  switch (dataset) {
    case "navi": {
      const vessels = await listVesselCards({ ...filters, limit: 5000 });
      sheet = {
        name: "Navi censite",
        columns: [
          { header: "Nome", key: "name", width: 28 },
          { header: "IMO", key: "imo", width: 12 },
          { header: "MMSI", key: "mmsi", width: 14 },
          { header: "Bandiera", key: "flag_country", width: 20 },
          { header: "Tipologia", key: "ship_type_label", width: 26 },
          { header: "Lunghezza (m)", key: "length_m" },
          { header: "Larghezza (m)", key: "beam_m" },
          { header: "GT", key: "gt" },
          { header: "DWT", key: "dwt" },
          { header: "Destinazione dichiarata", key: "destination_declared", width: 26 },
          { header: "Merci abituali", key: "profile_cargo_types", width: 30 },
          { header: "Ultimo segnale AIS", key: "last_seen", width: 22 },
        ],
        rows: vessels.map((vessel) => ({
          ...vessel,
          last_seen: formatDateTime(vessel.last_seen),
          profile_cargo_types: vessel.profile_cargo_types ?? "—",
        })),
      };
      break;
    }
    case "eventi": {
      const events = await listEvents({
        type: url.searchParams.get("type") ?? undefined,
        from: filters.from,
        to: filters.to,
        query: filters.query,
        limit: 2000,
      });
      sheet = {
        name: "Eventi AIS",
        columns: [
          { header: "Data/ora", key: "ts_it", width: 20 },
          { header: "Tipo", key: "type", width: 18 },
          { header: "Severità", key: "severity", width: 12 },
          { header: "Nave", key: "vessel_name", width: 28 },
          { header: "MMSI", key: "mmsi", width: 14 },
          { header: "Descrizione", key: "title", width: 52 },
          { header: "Email", key: "email_status", width: 14 },
          { header: "Letto", key: "acknowledged", width: 10 },
        ],
        rows: events.map((event) => ({
          ...event,
          ts_it: formatDateTime(event.ts),
          acknowledged: event.acknowledged ? "sì" : "no",
        })),
      };
      break;
    }
    case "posizioni": {
      const vesselId = Number(url.searchParams.get("vesselId") ?? 0);
      const rows = await all<{
        ts: string;
        mmsi: string;
        name: string | null;
        lat: number;
        lon: number;
        sog: number | null;
        cog: number | null;
        nav_status: number | null;
      }>(
        `SELECT p.ts, p.mmsi, v.name, p.lat, p.lon, p.sog, p.cog, p.nav_status
         FROM positions p JOIN vessels v ON v.id = p.vessel_id
         WHERE (? = 0 OR p.vessel_id = ?)
         ORDER BY p.ts DESC LIMIT 20000`,
        vesselId,
        vesselId,
      );
      sheet = {
        name: "Posizioni AIS",
        columns: [
          { header: "Data/ora", key: "ts_it", width: 20 },
          { header: "Nave", key: "name", width: 28 },
          { header: "MMSI", key: "mmsi", width: 14 },
          { header: "Latitudine", key: "lat", width: 14 },
          { header: "Longitudine", key: "lon", width: 14 },
          { header: "SOG (kn)", key: "sog" },
          { header: "COG (°)", key: "cog" },
          { header: "Stato", key: "nav_status_label", width: 24 },
        ],
        rows: rows.map((row) => ({ ...row, ts_it: formatDateTime(row.ts), nav_status_label: navStatusLabel(row.nav_status) })),
      };
      break;
    }
    case "dogana": {
      const operations = await listOperations();
      sheet = {
        name: "Operazioni doganali",
        columns: [
          { header: "Pratica", key: "title", width: 46 },
          { header: "Nave", key: "vessel_name", width: 28 },
          { header: "MMSI", key: "mmsi", width: 14 },
          { header: "Stato", key: "status", width: 14 },
          { header: "Merci", key: "cargo_types", width: 32 },
          { header: "Completamento", key: "percentuale", width: 14 },
          { header: "Documenti mancanti", key: "mancanti", width: 46 },
          { header: "Aggiornata", key: "updated_at_it", width: 20 },
        ],
        rows: operations.map((operation) => {
          const progress = operationProgress(operation);
          return {
            title: operation.title,
            vessel_name: operation.vessel_name,
            mmsi: operation.mmsi,
            status: operation.status,
            cargo_types: operation.cargo_types ?? "—",
            percentuale: `${progress.percent}%`,
            mancanti: operation.items.filter((item) => item.required === 1 && item.done === 0).map((item) => item.label).join("; ") || "—",
            updated_at_it: formatDateTime(operation.updated_at),
          };
        }),
      };
      break;
    }
    default: {
      const kind: CallKind =
        dataset === "arrivi"
          ? "arrivals"
          : dataset === "partenze"
            ? "departures"
            : dataset === "in-porto"
              ? "inport"
              : "expected";
      const calls = await listCalls(kind, { ...filters, limit: 5000 });
      sheet = {
        name: dataset.toUpperCase(),
        columns: [
          { header: "Nome nave", key: "name", width: 28 },
          { header: "IMO", key: "imo", width: 12 },
          { header: "MMSI", key: "mmsi", width: 14 },
          { header: "Tipologia", key: "ship_type_label", width: 26 },
          { header: "Bandiera", key: "flag_country", width: 18 },
          { header: "Provenienza", key: "last_port", width: 22 },
          { header: "Destinazione", key: "destination", width: 24 },
          { header: "ETA", key: "eta_it", width: 20 },
          { header: "ATA", key: "ata_it", width: 20 },
          { header: "Partenza", key: "departure_it", width: 20 },
          { header: "Distanza (mn)", key: "distance_nm", width: 14 },
          { header: "Velocità (kn)", key: "last_sog", width: 14 },
          { header: "GT", key: "gt" },
          { header: "DWT", key: "dwt" },
          { header: "Lunghezza (m)", key: "length_m" },
          { header: "Larghezza (m)", key: "beam_m" },
          { header: "Merci abituali", key: "profile_cargo_types", width: 30 },
        ],
        rows: calls.map((call) => ({
          ...call,
          eta_it: formatDateTime(call.effective_eta),
          ata_it: formatDateTime(call.ata),
          departure_it: formatDateTime(call.departure_ts),
          profile_cargo_types: call.profile_cargo_types ?? "—",
        })),
      };
      break;
    }
  }

  const buffer = await buildXlsx([sheet]);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${excelFileName(`portwatch_${dataset}`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
