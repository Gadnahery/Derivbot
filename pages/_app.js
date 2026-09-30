import { useEffect } from "react";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0a0e14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <title>Strategy Desk</title>
      </Head>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: #070b10;
          -webkit-text-size-adjust: 100%;
          overflow-x: hidden;
        }
        a { color: inherit; text-decoration: none; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .desk-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }
        .desk-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .desk-table-wrap table { min-width: 640px; }
        @media (max-width: 899px) {
          .desk-main { padding: 12px 12px 96px !important; max-width: 100vw; }
          .desk-cards { grid-template-columns: 1fr 1fr !important; }
          h1 { font-size: 1.25rem !important; }
        }
        @media (max-width: 480px) {
          .desk-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
