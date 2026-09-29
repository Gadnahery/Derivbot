export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #070b10; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        @media (max-width: 1100px) {
          .desk-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
