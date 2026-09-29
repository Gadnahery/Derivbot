export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #070b10; }
        a { color: inherit; }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        @media (max-width: 900px) {
          /* stack: user can scroll nav */
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
