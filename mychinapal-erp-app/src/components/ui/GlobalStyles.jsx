export default function GlobalStyles() {
  return (
    <style>{`
      @keyframes skShimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes floaty { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-7px) rotate(-4deg); } }
      @keyframes spin360 { to { transform: rotate(360deg); } }
      .ux-fade-in { animation: fadeInUp .3s ease both; }
      .ux-hover-lift { transition: transform .18s ease, box-shadow .18s ease; }
      .ux-hover-lift:hover { transform: translateY(-4px); box-shadow: 0 14px 30px rgba(37,99,235,.14); }
      .ux-row-hover { transition: background .15s ease; }
      .ux-row-hover:hover { background: #F4F7FC; }

      /* Fundament pod wersję mobilną — zapobiega poziomemu przewijaniu całej
         strony, gdy jakiś nieprzeliczony element (tabela, szeroki panel)
         wystaje poza szerokość ekranu telefonu, oraz pozwala na płynne
         przewijanie z bezwładnością na iOS wewnątrz przewijanych paneli. */
      html, body, #root { max-width: 100%; overflow-x: hidden; }
      * { -webkit-tap-highlight-color: transparent; }

      /* Typografia firmowa (Ustawienia -> Wygląd) — zmienne ustawiane globalnie
         przy starcie apki (patrz src/lib/typography.js, wywołane w App.jsx).
         Nagłówki ze stylem inline fontFamily: 'Syne' NIE są tym dotknięte —
         styl inline zawsze wygrywa z dziedziczoną wartością z body. */
      body {
        font-family: var(--app-font-family, 'Inter', system-ui, sans-serif);
        letter-spacing: var(--app-letter-spacing, 0px);
        line-height: calc(1.5 * var(--app-line-height-scale, 1));
      }
      @media (max-width: 768px) {
        body { font-size: 14px; }
        .scroll-x-mobile { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      }
    `}</style>
  )
}
