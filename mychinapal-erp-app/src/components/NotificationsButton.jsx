import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n/LanguageContext'
import { useUI } from '../lib/ui'
import { isPushSupported, isPushEnabled, enablePushNotifications, pushPermissionState } from '../lib/push'

// Przycisk włączający prawdziwe powiadomienia push na telefonie/komputerze —
// "jak WhatsApp": nowa wiadomość na czacie pokazuje się nawet gdy appka jest
// zamknięta/w tle. Znika, jeśli przeglądarka nie wspiera push, albo jeśli
// użytkownik jawnie zablokował powiadomienia w ustawieniach przeglądarki
// (wtedy i tak nic byśmy nie mogli zrobić z poziomu appki).
export default function NotificationsButton({ collapsed }) {
  const { t } = useLang()
  const { toast } = useUI()
  const [enabled, setEnabled] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!isPushSupported()) { setChecked(true); return }
    setDenied(pushPermissionState() === 'denied')
    isPushEnabled().then(v => { setEnabled(v); setChecked(true) })
  }, [])

  if (!isPushSupported() || !checked || enabled) return null

  const handleClick = async () => {
    if (denied) {
      toast.error(t('Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony — włącz je ręcznie (ikona kłódki obok adresu), a potem odśwież stronę.'))
      return
    }
    setBusy(true)
    const ok = await enablePushNotifications()
    setBusy(false)
    if (ok) { setEnabled(true); toast.success(t('Powiadomienia włączone.')) }
    else { setDenied(pushPermissionState() === 'denied'); toast.error(t('Nie udało się włączyć powiadomień.')) }
  }

  return (
    <div onClick={handleClick} title={t('Włącz powiadomienia o nowych wiadomościach')} style={{
      display: 'flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer', padding: '8px 9px', borderRadius: 7,
      background: 'rgba(37,99,235,.28)', color: '#fff', fontSize: 11, fontWeight: 700, marginBottom: 8,
      justifyContent: collapsed ? 'center' : 'flex-start', opacity: busy ? .6 : 1,
    }}>
      <span style={{ fontSize: 14 }}>🔔</span>
      {!collapsed && <span>{busy ? t('Włączanie…') : t('Włącz powiadomienia')}</span>}
    </div>
  )
}
