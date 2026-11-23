import { useState, type FormEvent } from 'react'
import './MerchantDashboard.css'

type MerchantWallet = {
  id: number
  nom: string
  telephone: string
  solde: number | string
  region: string
}

type MerchantTransaction = {
  id: number
  type: string
  montant: number | string
  frais: number | string
  solde_apres: number | string
  reference: string | null
  cree_le: string
}

type Props = {
  wallet: MerchantWallet
  transactions: MerchantTransaction[]
  loading: boolean
  onRefresh: () => void
  onSwitchWallet: () => void
}

type WebhookResponse = {
  secret: string
  url: string
}

function formatMoney(value: number | string): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return `${amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function MerchantDashboard({
  wallet,
  transactions,
  loading,
  onRefresh,
  onSwitchWallet,
}: Props) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [webhookError, setWebhookError] = useState('')
  const [webhookNotice, setWebhookNotice] = useState('')
  const [savingWebhook, setSavingWebhook] = useState(false)

  const paiements = transactions.filter(
    (transaction) => transaction.type === 'paiement_recu',
  )

  const volumeRecent = paiements.reduce(
    (total, transaction) => total + Number(transaction.montant),
    0,
  )

  async function configurerWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingWebhook(true)
    setWebhookError('')
    setWebhookNotice('')
    setWebhookSecret('')

    const form = new FormData(event.currentTarget)
    const url = String(form.get('url') ?? '')

    try {
      const response = await fetch(
        `/api/v1/marchands/${wallet.id}/webhook`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        },
      )

      const payload = (await response.json()) as
        | WebhookResponse
        | { detail?: string }

      if (!response.ok) {
        throw new Error(
          'detail' in payload && payload.detail
            ? payload.detail
            : 'Impossible de configurer le webhook.',
        )
      }

      if (!('secret' in payload) || !payload.secret) {
        throw new Error("L’API n’a pas renvoyé le secret du webhook.")
      }

      setWebhookUrl(payload.url)
      setWebhookSecret(payload.secret)
      setWebhookNotice('Webhook configuré. Copie son secret et conserve-le.')
    } catch (error) {
      setWebhookError(
        error instanceof Error ? error.message : 'Une erreur est survenue.',
      )
    } finally {
      setSavingWebhook(false)
    }
  }

  async function copierSecret() {
    try {
      await navigator.clipboard.writeText(webhookSecret)
      setWebhookNotice('Secret copié.')
    } catch {
      setWebhookError(
        'Copie automatique impossible. Sélectionne le secret pour le copier.',
      )
    }
  }

  return (
    <main className="main-content merchant-main">
      <header className="topbar merchant-topbar">
        <a className="brand merchant-brand" href="#marchand">
          <span className="brand-mark">G</span>
          <span>go<span className="brand-accent">pay</span></span>
        </a>
        <div className="topbar-spacer" />
        <span className="secure-label">Espace marchand</span>
        <button className="button button-outline" onClick={onSwitchWallet}>
          Changer de portefeuille
        </button>
      </header>

      <section className="page-heading">
        <div>
          <span className="eyebrow">ESPACE MARCHAND</span>
          <h1>Bonjour, {wallet.nom}</h1>
          <p>Retrouve tes paiements reçus et les paramètres de ton compte.</p>
        </div>
        <button
          className="button button-outline"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </section>

      <section className="merchant-summary">
        <article className="balance-card merchant-balance">
          <div className="balance-card-top">
            <span className="balance-label">SOLDE MARCHAND</span>
            <span className="balance-chip"><span /> Portefeuille actif</span>
          </div>
          <div className="balance-amount">{formatMoney(wallet.solde)}</div>
          <div className="balance-card-bottom">
            <div>
              <span className="balance-meta-label">MARCHAND</span>
              <strong>{wallet.nom}</strong>
            </div>
            <div>
              <span className="balance-meta-label">IDENTIFIANT</span>
              <strong>N° {wallet.id}</strong>
            </div>
          </div>
        </article>

        <article className="merchant-stat">
          <span className="eyebrow">PAIEMENTS AFFICHÉS</span>
          <strong>{paiements.length}</strong>
          <small>Dans les opérations chargées</small>
        </article>

        <article className="merchant-stat">
          <span className="eyebrow">VOLUME AFFICHÉ</span>
          <strong>{formatMoney(volumeRecent)}</strong>
          <small>Calculé sur ces mêmes opérations</small>
        </article>
      </section>

      <section className="transactions-section merchant-transactions">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ACTIVITÉ DU COMPTE</span>
            <h2>Paiements reçus</h2>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Chargement des paiements…</div>
        ) : paiements.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">↙</span>
            <strong>Aucun paiement reçu pour le moment</strong>
            <p>Les paiements à ton identifiant marchand apparaîtront ici.</p>
          </div>
        ) : (
          <div className="transaction-list">
            {paiements.map((transaction) => (
              <article className="transaction-row" key={transaction.id}>
                <span className="transaction-icon">+</span>
                <div className="transaction-info">
                  <strong>Paiement reçu</strong>
                  <small>
                    {transaction.reference?.startsWith('client:')
                      ? `Client ${transaction.reference.slice('client:'.length)}`
                      : 'Paiement Go Pay'}
                    {' · '}
                    {formatDate(transaction.cree_le)}
                  </small>
                </div>
                <div className="transaction-amount">
                  <strong>{formatMoney(transaction.montant)}</strong>
                  <small>Solde après · {formatMoney(transaction.solde_apres)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="merchant-webhook">
        <div>
          <span className="eyebrow">INTÉGRATION</span>
          <h2>Notifications de paiement</h2>
          <p>
            Configure une URL pour recevoir un événement quand un paiement est
            effectué sur ton portefeuille.
          </p>
          <p className="webhook-note">
            En développement, l’hôte doit être autorisé dans
            GOPAY_WEBHOOK_HOSTS. Le secret n’est affiché ici qu’après sa
            création : conserve-le.
          </p>
        </div>

        <form className="webhook-form" onSubmit={configurerWebhook}>
          <label htmlFor="merchant-webhook-url">URL du webhook</label>
          <input
            id="merchant-webhook-url"
            name="url"
            type="url"
            required
            placeholder="http://localhost:9000/webhook"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
          />
          {webhookError && (
            <p className="form-message" role="alert">{webhookError}</p>
          )}
          {webhookNotice && (
            <p className="webhook-success" role="status">{webhookNotice}</p>
          )}
          <button
            className="button button-primary"
            disabled={savingWebhook}
          >
            {savingWebhook ? 'Enregistrement…' : 'Configurer le webhook'}
          </button>

          {webhookSecret && (
            <div className="webhook-secret">
              <span>Secret de signature</span>
              <code>{webhookSecret}</code>
              <button type="button" className="detail-toggle" onClick={copierSecret}>
                Copier le secret
              </button>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}