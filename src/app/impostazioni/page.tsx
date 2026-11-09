import { SettingsPanel } from "@/components/SettingsPanel";
import { getSettings, listRecipients } from "@/lib/settings";
import { emailStatus } from "@/lib/notify/email";
import { databaseHealth } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ImpostazioniPage() {
  const [settings, recipients, email, database] = await Promise.all([
    getSettings(),
    listRecipients(),
    emailStatus(),
    databaseHealth(),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Configurazione del sistema</div>
          <h1 className="page-title">Impostazioni</h1>
          <p className="page-sub">
            Parametri dell&apos;area monitorata, soglie del rilevamento eventi, notifiche email e stato del
            collegamento alle fonti AIS.
          </p>
        </div>
      </div>

      <SettingsPanel
        initialSettings={settings}
        initialRecipients={recipients}
        initialEmail={email}
        database={database}
      />
    </>
  );
}
