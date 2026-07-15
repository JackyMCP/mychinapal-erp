import { useLang } from "../../lib/i18n/LanguageContext";
import { useMemo } from 'react'
import { C } from '../../lib/theme'
import EmptyState from '../ui/EmptyState'

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }

// Zamówienia (z modułu Projekty/Zamówienia) przesuwane są tu AUTOMATYCZNIE, gdy
// w Kasa & Bank ktoś oznaczy transakcję przypisaną do klienta+zamówienia jako
// "zaliczka za produkcję" (-> W produkcji / Fabryka) albo "dopłata końcowa"
// (-> Gotowe w magazynie) — patrz KasaBank.jsx handleSave(). Nic tu nie da się
// wpisać ręcznie, celowo, zgodnie z zasadą "magazyn musi być powiązany z realną
// płatnością, nie ręcznym wpisem".
function Row({ p, goClient }) {
  const { t } = useLang()
  return (
    <div onClick={() => goClient(p.client_id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.order_label}</div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{p.clients?.name || t('— brak klienta —')}</div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, textAlign: 'right', flexShrink: 0 }}>
        {p.goods_status_at ? new Date(p.goods_status_at).toLocaleDateString('pl-PL') : '—'}
      </div>
    </div>
  );
}

export default function TabFabryka({ projects, goClient }) {
  const { t } = useLang()
  const wProdukcji = useMemo(() => (projects || []).filter(p => p.goods_status === 'w_produkcji').sort((a, b) => new Date(b.goods_status_at || 0) - new Date(a.goods_status_at || 0)), [projects])
  const wMagazynie = useMemo(() => (projects || []).filter(p => p.goods_status === 'w_magazynie').sort((a, b) => new Date(b.goods_status_at || 0) - new Date(a.goods_status_at || 0)), [projects])

  return (
    <div>
      <div style={{ background: C.blight, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: C.text2, marginBottom: 16 }}>
        {t('Ta zakładka aktualizuje się sama — oznacz w Kasa & Bank transakcję (z przypisanym klientem i zamówieniem) jako "zaliczka za produkcję" albo "dopłata końcowa", żeby zamówienie pojawiło się tutaj lub przeszło dalej do magazynu.')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
            🏭 {t('W produkcji (Fabryka)')} {wProdukcji.length > 0 && <span style={{ background: C.olight, color: C.orange, borderRadius: 10, padding: '1px 8px', fontSize: 10, marginLeft: 6 }}>{wProdukcji.length}</span>}
          </div>
          {wProdukcji.length === 0
            ? <EmptyState icon="🏭" title={t('Brak zamówień w produkcji')} subtitle={t('Pojawią się tu po oznaczeniu zaliczki w Kasa & Bank.')} />
            : wProdukcji.map(p => <Row key={p.id} p={p} goClient={goClient} />)}
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
            📦 {t('Gotowe w magazynie')} {wMagazynie.length > 0 && <span style={{ background: C.glight, color: C.green, borderRadius: 10, padding: '1px 8px', fontSize: 10, marginLeft: 6 }}>{wMagazynie.length}</span>}
          </div>
          {wMagazynie.length === 0
            ? <EmptyState icon="📦" title={t('Brak towaru gotowego do wysyłki')} subtitle={t('Pojawi się tu po oznaczeniu dopłaty końcowej w Kasa & Bank.')} />
            : wMagazynie.map(p => <Row key={p.id} p={p} goClient={goClient} />)}
        </div>
      </div>
    </div>
  );
}
