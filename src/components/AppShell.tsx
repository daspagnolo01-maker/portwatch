"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectionBadge } from "./ConnectionBadge";
import { UserMenu } from "./UserMenu";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Panoramica",
    items: [
      { href: "/", label: "Dashboard", icon: "◧" },
      { href: "/mappa", label: "Mappa AIS", icon: "◎" },
    ],
  },
  {
    label: "Traffico portuale",
    items: [
      { href: "/attese", label: "Attese", icon: "◔" },
      { href: "/arrivi", label: "Arrivi", icon: "▼" },
      { href: "/partenze", label: "Partenze", icon: "▲" },
      { href: "/in-porto", label: "In porto", icon: "⚓" },
    ],
  },
  {
    label: "Archivio e controlli",
    items: [
      { href: "/navi", label: "Navi censite", icon: "⛴" },
      { href: "/dogana", label: "Dogana", icon: "⚖" },
      { href: "/eventi", label: "Eventi", icon: "◉" },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/impostazioni", label: "Impostazioni", icon: "⚙" }],
  },
];

export function AppShell({ children, portName }: { children: React.ReactNode; portName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("it-IT", {
          timeZone: "Europe/Rome",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="shell">
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Navigazione principale">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3v13" />
              <path d="M7 9l5-3 5 3" />
              <path d="M4 15c2.2 1.6 4.2 2.4 8 2.4S17.8 16.6 20 15" />
              <path d="M6 20h12" />
            </svg>
          </span>
          <span>
            <span className="brand-title">PORTWATCH</span>
            <span className="brand-sub" style={{ display: "block" }}>
              {portName} · ITTRI
            </span>
          </span>
        </Link>

        {GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${isActive(item.href) ? " active" : ""}`}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <span className="ico" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div>VTS · monitoraggio AIS</div>
          <div>37.98608° N · 13.70420° E</div>
          <div style={{ marginTop: 6 }}>
            Le informazioni merceologiche sono storiche e indicative.
          </div>
          <div style={{ marginTop: 6 }}>
            Dati AIS: AISStream · Open Waters AIS (aiscast) / AISHub.
          </div>
        </div>
      </aside>

      {open && (
        <button
          aria-label="Chiudi menu"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            border: "none",
            zIndex: 35,
          }}
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-icon mobile-nav-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-label="Apri menu"
          >
            ☰
          </button>
          <span className="topbar-title">
            Sistema di monitoraggio marittimo · Porto di Termini Imerese (PA)
          </span>
          <span className="topbar-spacer" />
          <UserMenu />
          <ConnectionBadge />
          <span className="topbar-clock" title="Ora locale di Roma">
            {clock || "--:--:--"} <span style={{ color: "var(--dim)" }}>CET</span>
          </span>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
