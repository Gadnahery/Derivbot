import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Overview", tip: "Status & live PnL" },
  { href: "/chart", label: "Chart", tip: "Candles & levels" },
  { href: "/pipeline", label: "Strategy", tip: "What the bot is doing" },
  { href: "/trades", label: "Trades", tip: "History & results" },
  { href: "/journal", label: "Activity", tip: "Plain-language log" },
  { href: "/stats", label: "Performance", tip: "Win rate & totals" },
];

export default function Layout({ children, scanning, onScan, onRefresh, statusLabel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const close = () => setOpen(false);
    router.events?.on("routeChangeStart", close);
    return () => router.events?.off("routeChangeStart", close);
  }, [router]);

  const showSidebar = wide || open;

  return (
    <div className="desk-shell" style={S.shell}>
      {/* Mobile top bar */}
      {!wide && (
        <header className="desk-topbar" style={S.topbar}>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            style={S.iconBtn}
          >
            {open ? "✕" : "☰"}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>STRATEGY DESK</div>
            <div style={{ fontSize: 11, opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {statusLabel || "STANDBY"}
            </div>
          </div>
          <button type="button" style={S.scanBtnSm} onClick={onScan} disabled={scanning}>
            {scanning ? "…" : "Scan"}
          </button>
        </header>
      )}

      {/* Backdrop on mobile */}
      {!wide && open && (
        <div className="desk-backdrop" style={S.backdrop} onClick={() => setOpen(false)} />
      )}

      <aside
        className="desk-sidebar"
        style={{
          ...S.sidebar,
          ...(wide
            ? {}
            : {
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
                zIndex: 40,
                transform: open ? "translateX(0)" : "translateX(-105%)",
                transition: "transform 0.2s ease",
                boxShadow: open ? "8px 0 32px rgba(0,0,0,0.45)" : "none",
              }),
        }}
      >
        <div style={S.logo}>STRATEGY DESK</div>
        <div style={S.logoSub}>Dominance · Sweep · Body-close</div>
        <nav style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto" }}>
          {NAV.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href} legacyBehavior>
                <a
                  style={{ ...S.navItem, ...(active ? S.navActive : {}) }}
                  onClick={() => setOpen(false)}
                >
                  <div style={{ fontWeight: 650 }}>{item.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{item.tip}</div>
                </a>
              </Link>
            );
          })}
        </nav>
        <div style={S.sideFoot}>
          <div style={S.pill}>
            <span
              style={{
                ...S.dot,
                background: scanning ? "#e6c07b" : statusLabel === "IN TRADE" ? "#f07178" : "#3dd68c",
              }}
            />
            {scanning ? "SCANNING" : statusLabel || "STANDBY"}
          </div>
          <button type="button" style={S.btnGhost} onClick={onRefresh}>
            Refresh data
          </button>
          <button type="button" style={S.btnPrimary} onClick={onScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan now"}
          </button>
        </div>
      </aside>

      <div className="desk-main" style={{ ...S.main, ...(wide ? {} : { paddingTop: 64 }) }}>
        {children}
      </div>
    </div>
  );
}

const S = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "#070b10",
    color: "#e8eef5",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  topbar: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    height: 56,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px",
    background: "#0a0e14",
    borderBottom: "1px solid #1a2332",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "1px solid #243044",
    background: "#121820",
    color: "#e8eef5",
    fontSize: 18,
    cursor: "pointer",
  },
  scanBtnSm: {
    background: "#1a7f4b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 12px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 35,
  },
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: "1px solid #1a2332",
    background: "#0a0e14",
    padding: "20px 14px",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    position: "sticky",
    top: 0,
  },
  logo: { fontSize: 14, fontWeight: 800, letterSpacing: 1.4 },
  logoSub: { fontSize: 11, opacity: 0.45, marginTop: 4 },
  navItem: {
    display: "block",
    padding: "10px 12px",
    borderRadius: 10,
    color: "#c5d0de",
    textDecoration: "none",
    border: "1px solid transparent",
  },
  navActive: {
    background: "#121a24",
    borderColor: "#243044",
    color: "#fff",
  },
  sideFoot: { display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#121820",
    border: "1px solid #1e2a3a",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 11,
    fontWeight: 700,
  },
  dot: { width: 8, height: 8, borderRadius: 99 },
  btnGhost: {
    background: "#121820",
    color: "#e8eef5",
    border: "1px solid #243044",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
  },
  btnPrimary: {
    background: "#1a7f4b",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  main: {
    flex: 1,
    minWidth: 0,
    padding: "20px 22px 40px",
    width: "100%",
  },
};
