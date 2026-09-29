export default function App({ Component, pageProps }) {
  return (
    <>
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
        img, svg, canvas { max-width: 100%; }

        .desk-grid-2 {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 12px;
        }
        .desk-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }
        .desk-table-wrap {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .desk-table-wrap table { min-width: 640px; }

        .symbol-chips::-webkit-scrollbar { height: 4px; }
        .symbol-chips::-webkit-scrollbar-thumb { background: #243044; border-radius: 4px; }

        @media (max-width: 899px) {
          .desk-main {
            padding: 12px 12px 96px !important;
            max-width: 100vw;
          }
          .desk-grid-2 {
            grid-template-columns: 1fr !important;
          }
          .desk-cards {
            grid-template-columns: 1fr 1fr !important;
          }
          h1 { font-size: 1.25rem !important; }
        }

        @media (max-width: 480px) {
          .desk-cards {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
