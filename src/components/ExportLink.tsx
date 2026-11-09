export function ExportLink({ dataset, label = "Esporta Excel" }: { dataset: string; label?: string }) {
  return (
    <a className="btn" href={`/api/export?dataset=${encodeURIComponent(dataset)}`}>
      ⤓ {label}
    </a>
  );
}
