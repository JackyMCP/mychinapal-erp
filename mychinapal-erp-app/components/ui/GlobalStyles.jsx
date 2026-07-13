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
    `}</style>
  )
}
