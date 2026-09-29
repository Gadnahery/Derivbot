import Link from "next/link";
import { useRouter } from "next/router";

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
  return (
    <div style={S.shell}>
      <aside style={S.sidebar}>
        <div style={S.logo}>STRATEGY DESK</div>
        <div style={S.logoSub}>Dominance · Sweep · Body-close</div>
        <nav style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href} legacyBehavior>
                <a style={{ ...S.navItem, ...(active ? S.navActive : {}) }}>
                  <div style={{ fontWeight: 650 }}>{item.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>{item.tip}</div>
                </a>
              </Link>
            );
          })}
        </nav>
        <div style={{ flex: 1 }} />
        <div style={S.sideFoot}>
          <div style={S.pill}>
            <span style={{ ...S.dot, background: scanning ? "#e6c07b" : statusLabel === "IN TRADE" ? "#f07178" : "#3dd68c" }} />
            {scanning ? "SCANNING" : statusLabel}
          </div>
          <button style={S.btnGhost} onClick={onRefresh}>Refresh data</button>
          <button style={S.btnPrimary} onClick={onScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan now"}
          </button>
        </div>
      </aside>
      <div style={S.main}>{children}</div>
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
  sidebar: {
    width: 240,
    flexShrink: 0,
    borderRight: "1px solid #1a2332",
    background: "#0a0e14",
    padding: "20px 14px",
    display: "flex",
    flexDirection: "column",
    position: "sticky",
    top: 0,
    height: "100vh",
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
  main: { flex: 1, minWidth: 0, padding: "20px 22px 40px" },
};
