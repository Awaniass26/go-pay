import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import MerchantDashboard from './MerchantDashboard'

type Wallet = {
  id: number
  nom: string
  telephone: string
  type: string
  solde: number | string
  cree_le: string
  region: string
}

type Transaction = {
  id: number
  wallet_id: number
  type: string
  montant: number | string
  frais: number | string
  solde_apres: number | string
  reference: string | null
  cree_le: string
  beneficiaire_tel: string | null
}

type HistoryPage = {
  items: Transaction[]
  next_cursor: number | null
}

type TransferResult = {
  id: number
  code_retrait: string
  montant: number | string
  statut: string
}

type Action = 'deposit' | 'transfer' | 'payment'

class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response

  try {
    response = await fetch(`/api${path}`, { ...options, headers })
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Impossible de joindre l'API. Vérifie qu'elle est démarrée.")
    }
    throw error
  }

  if (!response.ok) {
    const text = await response.text()
    let message = text || `Erreur HTTP ${response.status}`

    if (text) {
      try {
        const payload = JSON.parse(text) as {
          detail?: unknown
          title?: unknown
        }
        if (typeof payload.detail === 'string') message = payload.detail
        else if (typeof payload.title === 'string') message = payload.title
      } catch {
        message = text
      }
    }

    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
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

function readableType(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'
}

function App() {
  const [walletId, setWalletId] = useState<number | null>(() => {
    const saved = Number(window.localStorage.getItem('gopay.walletId'))
    return Number.isInteger(saved) && saved > 0 ? saved : null
  })
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expandedTransactionId, setExpandedTransactionId] =
  useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [action, setAction] = useState<Action | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [transferCode, setTransferCode] = useState('')
  const [trackedTransferId, setTrackedTransferId] = useState<number | null>(null)
  const [transferStatus, setTransferStatus] = useState('')
  const [trackingError, setTrackingError] = useState('')

  useEffect(() => {
    if (walletId === null) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setPageError('')

    Promise.all([
      request<Wallet>(`/v1/wallets/${walletId}`),
      request<HistoryPage>(`/v1/wallets/${walletId}/transactions?limit=8`),
    ])
      .then(([walletData, history]) => {
        if (!active) return
        setWallet(walletData)
        setTransactions(history.items)
      })
      .catch((error: unknown) => {
        if (!active) return

        if (error instanceof ApiError && error.status === 404) {
          window.localStorage.removeItem('gopay.walletId')
          setWalletId(null)
          setWallet(null)
          setTransactions([])
          setPageError(
            "Ce portefeuille n'existe plus dans l'API. Les données de démonstration sont en mémoire et disparaissent au redémarrage du serveur.",
          )
        } else {
          setPageError(errorMessage(error))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [walletId, refreshKey])


  useEffect(() => {
  if (trackedTransferId === null) return

  const stream = new EventSource(
    `/api/v1/transferts/${trackedTransferId}/suivi`,
  )

  setTransferStatus('Connexion au suivi…')
  setTrackingError('')

  const onStatus = (event: Event) => {
    try {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as { statut?: unknown }

      if (typeof payload.statut !== 'string') {
        throw new Error('Statut de transfert invalide.')
      }

      setTransferStatus(payload.statut)

      if (payload.statut === 'retire') {
        setNotice('Le bénéficiaire a retiré le transfert.')
        stream.close()
      }
    } catch {
      setTrackingError('Impossible de lire la mise à jour du transfert.')
      stream.close()
    }
  }

  stream.addEventListener('statut', onStatus)

  stream.onerror = () => {
    setTrackingError('Connexion au suivi interrompue.')
    stream.close()
  }

  const timeout = window.setTimeout(() => {
    stream.close()
    setTrackingError('Le suivi automatique est terminé après 60 secondes.')
  }, 61_000)

  return () => {
    window.clearTimeout(timeout)
    stream.close()
  }
}, [trackedTransferId])

  async function createWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setCreateError('')

    const form = new FormData(event.currentTarget)

    try {
      const created = await request<Wallet>('/v1/wallets', {
        method: 'POST',
        body: JSON.stringify({
          nom: String(form.get('nom') ?? ''),
          telephone: String(form.get('telephone') ?? '').replaceAll(' ', ''),
          region: String(form.get('region') ?? 'Dakar'),
          type: String(form.get('type') ?? 'client'),
        }),
      })

      window.localStorage.setItem('gopay.walletId', String(created.id))
      setWallet(created)
      setWalletId(created.id)
      setNotice('Votre portefeuille Go Pay est prêt.')
      setPageError('')
    } catch (error) {
      setCreateError(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!wallet || !action) return

    setActionLoading(true)
    setActionError('')
    setTransferCode('')
    setTrackedTransferId(null)
    setTransferStatus('')
    setTrackingError('')

    const form = new FormData(event.currentTarget)
    const montant = Number(form.get('montant'))

    try {
      if (action === 'deposit') {
        await request<Transaction>(`/v1/wallets/${wallet.id}/depots`, {
          method: 'POST',
          body: JSON.stringify({ montant }),
        })
        setNotice('Dépôt effectué avec succès.')
      }

      if (action === 'transfer') {
        const result = await request<TransferResult>('/v1/transferts', {
          method: 'POST',
          headers: { 'x-wallet-id': String(wallet.id) },
          body: JSON.stringify({
            montant,
            beneficiaire_tel: String(form.get('telephone') ?? '').replaceAll(' ', ''),
          }),
        })
        setTransferCode(result.code_retrait)
        setTrackedTransferId(result.id)
        setTransferStatus('Connexion au suivi…')
        setTrackingError('')
        setNotice('Transfert créé. Communique le code de retrait au bénéficiaire.')
      }

      if (action === 'payment') {
        await request<Transaction>('/v1/paiements', {
          method: 'POST',
          headers: { 'x-wallet-id': String(wallet.id) },
          body: JSON.stringify({
            montant,
            marchand_id: Number(form.get('marchand_id')),
          }),
        })
        setNotice('Paiement effectué avec succès.')
      }

      setAction(null)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setActionLoading(false)
    }
  }

  function openAction(nextAction: Action) {
    setActionError('')
    setTransferCode('')
    setAction(nextAction)
  }

  function resetWallet() {
    window.localStorage.removeItem('gopay.walletId')
    setWalletId(null)
    setWallet(null)
    setTransactions([])
    setPageError('')
    setNotice('')
  }

  if (wallet?.type === 'marchand') {
  return (
    <MerchantDashboard
      wallet={wallet}
      transactions={transactions}
      loading={loading}
      onRefresh={() => setRefreshKey((value) => value + 1)}
      onSwitchWallet={resetWallet}
    />
  )
}

  if (walletId === null && !wallet) {
    return (
      <main className="welcome-page">
        <section className="welcome-card">
          <a className="brand" href="#accueil" aria-label="Go Pay accueil">
            <span className="brand-mark">G</span>
            <span>go<span className="brand-accent">pay</span></span>
          </a>
          <div className="welcome-copy">
            <span className="eyebrow">VOTRE ARGENT, EN MOUVEMENT</span>
            <h1>Simple. Rapide.<br /><span>Go Pay.</span></h1>
            <p>
              Crée ton portefeuille et retrouve une façon plus simple de gérer
              ton argent au quotidien.
            </p>
          </div>
          <form className="create-form" onSubmit={createWallet}>
            <label>
              Nom complet
              <input name="nom" required minLength={2} maxLength={100} placeholder="Ex. Awa Diop" />
            </label>
            <label>
              Numéro de téléphone
              <input
                name="telephone"
                required
                inputMode="tel"
                placeholder="+221 77 000 00 00"
                pattern="\+221\s?7[05678]\d{7}"
                title="Utilise un numéro sénégalais, par exemple +221 77 000 00 00"
              />
            </label>
            <label>
              Type de portefeuille
              <select name="type" defaultValue="client">
                <option value="client">Client</option>
                <option value="marchand">Marchand</option>
              </select>
            </label>
            <label>
              Région
              <select name="region" defaultValue="Dakar">
                <option>Dakar</option>
                <option>Thiès</option>
                <option>Diourbel</option>
                <option>Saint-Louis</option>
                <option>Kaolack</option>
                <option>Ziguinchor</option>
              </select>
            </label>
            {pageError && <p className="form-message">{pageError}</p>}
            {createError && <p className="form-message">{createError}</p>}
            <button className="button button-primary button-wide" disabled={creating}>
              {creating ? 'Création en cours…' : 'Créer mon portefeuille'}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="form-note">
              Démonstration : les données du serveur sont conservées en mémoire.
            </p>
          </form>
        </section>
        <div className="welcome-decoration" aria-hidden="true">
          <span className="decoration-orb orb-one" />
          <span className="decoration-orb orb-two" />
          <span className="decoration-grid" />
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell" id="top">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Go Pay accueil">
          <span className="brand-mark">G</span>
          <span>go<span className="brand-accent">pay</span></span>
        </a>

        <span className="sidebar-label">MENU</span>
        <nav className="side-nav" aria-label="Navigation principale">
          <a className="nav-link active" href="#overview"><span>◫</span> Vue d’ensemble</a>
          <a className="nav-link" href="#transactions"><span>↕</span> Activité</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">?</span>
            <strong>Besoin d’aide ?</strong>
            <p>Ton portefeuille Go Pay est prêt à être utilisé.</p>
          </div>
          <button className="profile-button" onClick={resetWallet}>
            <span className="avatar">{wallet?.nom?.charAt(0).toUpperCase() ?? 'G'}</span>
            <span className="profile-copy">
              <strong>{wallet?.nom ?? 'Mon portefeuille'}</strong>
              <small>Changer de portefeuille</small>
            </span>
            <span className="profile-more">···</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">G</span>
            <span>go<span className="brand-accent">pay</span></span>
          </div>
          <div className="topbar-spacer" />
          <span className="secure-label"><span className="secure-dot" /> Espace sécurisé</span>
          <span className="top-avatar">{wallet?.nom?.charAt(0).toUpperCase() ?? 'G'}</span>
        </header>

        <section className="page-heading" id="overview">
          <div>
            <span className="eyebrow">TON ESPACE GO PAY</span>
            <h1>Bonjour{wallet?.nom ? `, ${wallet.nom.split(' ')[0]}` : ''} <span className="wave">👋</span></h1>
            <p>Voici un aperçu de ton portefeuille aujourd’hui.</p>
          </div>
          <button className="button button-outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <span className={loading ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span>
            Actualiser
          </button>
        </section>

        {pageError && (
          <div className="notice notice-error" role="alert">
            <span>{pageError}</span>
            <button onClick={resetWallet}>Créer un nouveau portefeuille</button>
          </div>
        )}
        {notice && (
          <div className="notice notice-success" role="status">
            <span>{notice}</span>
            <button className="notice-close" onClick={() => setNotice('')} aria-label="Fermer">×</button>
          </div>
        )}
        {transferCode && (
  <div className="transfer-receipt">
    <div>
      <span className="eyebrow">CODE DE RETRAIT</span>
      <strong>{transferCode}</strong>
      <p>À communiquer uniquement au bénéficiaire du transfert.</p>

      <p className="transfer-live-status">
        Statut : {
          transferStatus === 'en_attente'
            ? 'En attente du retrait'
            : transferStatus === 'retire'
              ? 'Retiré par le bénéficiaire'
              : transferStatus || 'Connexion au suivi…'
        }
      </p>

      {trackingError && (
        <p className="transfer-tracking-error" role="status">
          {trackingError}
        </p>
      )}
    </div>
    <span className="receipt-mark">✓</span>
  </div>
)}

        <section className="dashboard-grid">
          <div className="dashboard-main">
            <article className="balance-card">
              <div className="balance-card-top">
                <span className="balance-label">SOLDE DISPONIBLE</span>
                <span className="balance-chip"><span /> Portefeuille actif</span>
              </div>
              <div className="balance-amount">
                {loading ? <span className="loading-line" /> : formatMoney(wallet?.solde ?? 0)}
              </div>
              <div className="balance-card-bottom">
                <div>
                  <span className="balance-meta-label">TITULAIRE</span>
                  <strong>{wallet?.nom ?? 'Chargement…'}</strong>
                </div>
                <div>
                  <span className="balance-meta-label">PORTEFEUILLE</span>
                  <strong> N° {wallet?.id ?? walletId}</strong>
                </div>
                <span className="balance-watermark" aria-hidden="true">G</span>
              </div>
            </article>

            <section className="quick-actions" aria-labelledby="actions-title">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">EN QUELQUES SECONDES</span>
                  <h2 id="actions-title">Actions rapides</h2>
                </div>
              </div>
              <div className="action-grid">
                <button className="action-card" onClick={() => openAction('deposit')} disabled={!wallet || loading}>
                  <span className="action-icon icon-mint">＋</span>
                  <span><strong>Déposer</strong><small>Ajouter de l’argent</small></span>
                  <span className="action-arrow">↗</span>
                </button>
                <button className="action-card" onClick={() => openAction('transfer')} disabled={!wallet || loading}>
                  <span className="action-icon icon-lilac">↗</span>
                  <span><strong>Transférer</strong><small>Envoyer à un proche</small></span>
                  <span className="action-arrow">↗</span>
                </button>
                <button className="action-card" onClick={() => openAction('payment')} disabled={!wallet || loading}>
                  <span className="action-icon icon-peach">▣</span>
                  <span><strong>Payer</strong><small>Régler un marchand</small></span>
                  <span className="action-arrow">↗</span>
                </button>
              </div>
            </section>

            <section className="transactions-section" id="transactions">
              <div className="section-heading transactions-heading">
                <div>
                  <span className="eyebrow">TES DERNIÈRES OPÉRATIONS</span>
                  <h2>Activité récente</h2>
                </div>
                <span className="activity-count">{transactions.length} opération{transactions.length !== 1 ? 's' : ''}</span>
              </div>

              {loading ? (
                <div className="empty-state">Chargement de ton activité…</div>
              ) : transactions.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">↕</span>
                  <strong>Pas encore d’activité</strong>
                  <p>Tes dépôts et opérations apparaîtront ici.</p>
                </div>
              ) : (
                <div className="transaction-list">
                  {transactions.map((transaction) => {
                 const expanded = expandedTransactionId === transaction.id
  

  return (
    <article className="transaction-item" key={transaction.id}>
      <div className="transaction-row">
        <span className="transaction-icon">
          {readableType(transaction.type).charAt(0)}
        </span>

        <div className="transaction-info">
          <strong>{readableType(transaction.type)}</strong>
          <small>{formatDate(transaction.cree_le)}</small>
        </div>

        <div className="transaction-amount">
          <strong>{formatMoney(transaction.montant)}</strong>
          <small>Solde après · {formatMoney(transaction.solde_apres)}</small>
        </div>

        <button
          className="detail-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() =>
            setExpandedTransactionId(expanded ? null : transaction.id)
          }
        >
          {expanded ? 'Masquer' : 'Voir plus'}
        </button>
      </div>

      {expanded && (
        <div className="transaction-details">
          <div>
            <span>Frais</span>
            <strong>{formatMoney(transaction.frais)}</strong>
          </div>

          {transaction.beneficiaire_tel && (
            <div>
              <span>Bénéficiaire</span>
              <strong>{transaction.beneficiaire_tel}</strong>
            </div>
          )}

          {transaction.reference && (
            <div>
              <span>Référence</span>
              <strong>{transaction.reference}</strong>
            </div>
          )}
        </div>
      )}
    </article>
  )
})}
                </div>
              )}
            </section>
          </div>

          <aside className="dashboard-aside">
            <article className="info-card">
              <div className="info-card-heading">
                <span className="info-icon">✦</span>
                <span className="status-pill">ACTIF</span>
              </div>
              <span className="eyebrow">TON PORTEFEUILLE</span>
              <h3>Tout est prêt.</h3>
              <p>Ton portefeuille Go Pay est opérationnel. Choisis une action rapide pour commencer.</p>
              <div className="info-divider" />
              <div className="wallet-detail">
                <span>Région</span><strong>{wallet?.region ?? '—'}</strong>
              </div>
              <div className="wallet-detail">
                <span>Téléphone</span><strong>{wallet?.telephone ?? '—'}</strong>
              </div>
            </article>

            <article className="tip-card">
              <span className="tip-sparkle">✳</span>
              <span className="eyebrow">PETIT RAPPEL</span>
              <h3>Protège ton code.</h3>
              <p>Ne partage jamais un code de retrait avec une personne autre que le bénéficiaire.</p>
            </article>
          </aside>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        <a className="mobile-nav-item active" href="#overview"><span>◫</span>Accueil</a>
        <a className="mobile-nav-item" href="#transactions"><span>↕</span>Activité</a>
      </nav>

      {action && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAction(null)
        }}>
          <section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close" onClick={() => setAction(null)} aria-label="Fermer">×</button>
            <span className="eyebrow">GO PAY · OPÉRATION</span>
            <h2 id="modal-title">
              {action === 'deposit' ? 'Faire un dépôt' : action === 'transfer' ? 'Envoyer de l’argent' : 'Payer un marchand'}
            </h2>
            <p className="modal-description">
              {action === 'deposit'
                ? 'Ajoute un montant à ton portefeuille de démonstration.'
                : action === 'transfer'
                  ? 'Le bénéficiaire retirera le transfert avec le code généré.'
                  : 'Saisis l’identifiant du marchand et le montant à payer.'}
            </p>
            <form className="action-form" onSubmit={submitAction}>
              {action === 'transfer' && (
                <label>
                  Téléphone du bénéficiaire
                  <input
                    name="telephone"
                    required
                    inputMode="tel"
                    placeholder="+221 77 000 00 00"
                    pattern="\+221\s?7[05678]\d{7}"
                    title="Utilise un numéro sénégalais, par exemple +221 77 000 00 00"
                  />
                </label>
              )}
              {action === 'payment' && (
                <label>
                  Identifiant du marchand
                  <input name="marchand_id" type="number" min="1" step="1" required placeholder="Ex. 2" />
                </label>
              )}
              <label>
                Montant (FCFA)
                <input
                  name="montant"
                  type="number"
                  min={action === 'transfer' ? '100' : '1'}
                  step="1"
                  required
                  placeholder={action === 'transfer' ? 'Minimum 100 FCFA' : 'Ex. 5 000'}
                />
              </label>
              {actionError && <p className="form-message" role="alert">{actionError}</p>}
              <button className="button button-primary button-wide" disabled={actionLoading}>
                {actionLoading ? 'Traitement…' : 'Confirmer'}
                <span aria-hidden="true">↗</span>
              </button>
              <p className="form-note">Vérifie les informations avant de confirmer l’opération.</p>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
