import { useLang } from "../../lib/i18n/LanguageContext";
import { C, fmt } from '../../lib/theme'

// vatSummary: [{label, value, description}]  (report_vat_summary — snapshot z Excela)
// podatkiPayments: [{date, label, amount}]     (live z tabeli transactions, kategoria PODATKI)
export default function TabVAT({ vatSummary, podatkiPayments }) {
  const {
    t
  } = useLang();

  const suma = podatkiPayments.reduce((s, p) => s + p.amount, 0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{t("📋 Podsumowanie VAT — całość (arkusz Podsumowanie_VAT)")}</div>
        {vatSummary.map((r, i) => {
          const isTotal = r.label.includes('DO ZAPŁATY') || r.label.includes('POZOSTAŁO')
          const color = r.label.includes('należny') ? C.red : r.label.includes('naliczony') && !r.label.includes('razem') ? C.green : r.label.includes('razem') ? C.green : r.label.includes('POZOSTAŁO') ? (r.value > 0 ? C.red : C.green) : r.label.includes('nadpłata') ? C.blue : C.text
          return (
            <div key={i} style={{ padding: '8px 0', borderBottom: i < vatSummary.length - 1 ? `1px solid ${C.border}` : 'none', borderTop: isTotal && i > 0 ? `1.5px solid ${C.border}` : 'none', marginTop: isTotal && i > 0 ? 4 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: isTotal ? 700 : 400 }}>{t(r.label)}</span>
                <span style={{ fontSize: isTotal ? 14 : 12, fontWeight: 700, color }}>{fmt(r.value)} {t("PLN")}</span>
              </div>
              {r.description && <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1, lineHeight: 1.3 }}>{r.description}</div>}
            </div>
          );
        })}
        <div style={{ marginTop: 14, background: C.blight, border: `1px solid ${C.bmid}`, borderRadius: 7, padding: '9px 11px', fontSize: 11, color: C.blue, lineHeight: 1.5 }}>
          {t("ℹ️")} <strong>{t("Art. 33a")}</strong> {t(
            "od 01.2026 — VAT importowy rozliczany przez JPK V7K (nie gotówką). Wiersze PRZEKSIĘGOWANIE VAT MPP z PL11 ="
          )} <strong>{t("nie_podlega")}</strong>.
                  </div>
      </div>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{t("🏛️ Płatności VAT/CIT do US z wyciągów bankowych")} <span style={{ fontWeight: 400, color: C.muted }}>{t("(na żywo z rejestru)")}</span></div>
        {podatkiPayments.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak zarejestrowanych płatności podatkowych.")}</div>}
        {podatkiPayments.map((v, i, arr) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500 }}>{t(v.label)}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted }}>{v.date}</span>
              </div>
            </div>
            <span style={{ fontWeight: 700, color: C.red, fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(v.amount)} {t("PLN")}</span>
          </div>
        ))}
        <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
          <span>{t("SUMA")}</span><span style={{ color: C.red }}>{fmt(suma)} {t("PLN")}</span>
        </div>
      </div>
    </div>
  );
}
