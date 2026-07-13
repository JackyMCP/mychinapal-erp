import { useLang } from "../../lib/i18n/LanguageContext";
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { C } from '../../lib/theme'

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic)$/i

export default function TabGaleria({ documents }) {
  const { t } = useLang()
  const images = documents.filter(d => IMAGE_EXT.test(d.file_name || d.file_path || ''))
  const [urlByPath, setUrlByPath] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (images.length === 0) { setLoading(false); return }
      setLoading(true)
      const paths = images.map(d => d.file_path)
      const { data, error } = await supabase.storage.from('dokumenty').createSignedUrls(paths, 3600)
      if (!cancelled) {
        if (error) console.error(error)
        const map = {}
        ;(data || []).forEach(r => { if (r.signedUrl) map[r.path] = r.signedUrl })
        setUrlByPath(map)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [JSON.stringify(images.map(d => d.id))])

  if (loading) return <div style={{ fontSize: 11, color: C.muted }}>{t("Ładowanie…")}</div>

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>🖼️ {t("Galeria zdjęć — produkty, kontrola jakości, dostawy")}</div>
      {images.length === 0 && <div style={{ fontSize: 11, color: C.muted }}>{t("Brak zdjęć — pliki graficzne wysłane na czacie lub wgrane ręcznie pojawią się tutaj automatycznie.")}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {images.map(d => (
          <div key={d.id} onClick={() => setLightbox(d)} style={{
            aspectRatio: '1', borderRadius: 14, position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: '.25s',
            backgroundImage: urlByPath[d.file_path] ? `url(${urlByPath[d.file_path]})` : 'linear-gradient(135deg,#334155,#0F172A)',
            backgroundSize: 'cover', backgroundPosition: 'center',
          }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg,rgba(0,0,0,.65),transparent)', color: '#fff', fontSize: 9.5, padding: '16px 8px 6px' }}>
              {t(d.category)}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <span onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 26, right: 34, color: '#fff', fontSize: 26, cursor: 'pointer' }}>✕</span>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(560px, 80vw)', aspectRatio: '4/3', borderRadius: 14,
            backgroundImage: urlByPath[lightbox.file_path] ? `url(${urlByPath[lightbox.file_path]})` : 'linear-gradient(135deg,#334155,#0F172A)',
            backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#0F172A',
          }} />
        </div>
      )}
    </div>
  )
}
