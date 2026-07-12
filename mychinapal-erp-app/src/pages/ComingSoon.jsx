import { useLang } from "../lib/i18n/LanguageContext";
import PageHeader from '../components/PageHeader'
import SectionCard from '../components/SectionCard'
import { C } from '../lib/theme'

export default function ComingSoon({ title }) {
  const {
    t
  } = useLang();

  return (
    <div>
      <PageHeader title={title} />
      <div style={{ padding: '16px 22px', maxWidth: 900 }}>
        <SectionCard>
          <div style={{ fontSize: 12, color: C.muted }}>
            {t(
              "Ten moduł podłączymy do bazy w kolejnym etapie prac — na razie działa logowanie, role/uprawnienia (RLS) oraz moduły Dashboard, Klienci i Projekty na żywych danych."
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
