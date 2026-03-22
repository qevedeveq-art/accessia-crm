'use client'

import { useState } from 'react'
import {
  BookOpen, Shield, Globe, Package, ChevronRight, ExternalLink,
  ShieldCheck, AlertTriangle, Lock, Server, FileText, Users,
  Clock, Database, Bell, Key, Wifi, Mail, BarChart2, HardDrive,
  MessageSquare, Video, CheckCircle, Info, Zap, Star,
} from 'lucide-react'
import { clsx } from 'clsx'

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'rgpd' | 'souverainete' | 'outils'

interface ToolItem {
  name: string
  description: string
  category: string
  url: string
  stars?: string
  icon: any
  tags: string[]
}

// ─── Données ─────────────────────────────────────────────────────────────────

const RGPD_PRINCIPLES = [
  {
    title: 'Licéité, loyauté et transparence',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    description:
      'Les données doivent être traitées de manière licite, loyale et transparente vis-à-vis de la personne concernée. Informez toujours vos clients et prospects de la collecte et de son but.',
    points: [
      'Politique de confidentialité accessible et rédigée en langage clair',
      'Information au moment de la collecte (formulaires, contrats)',
      'Pas de traitement caché ou dissimulé',
    ],
  },
  {
    title: 'Limitation des finalités',
    icon: Shield,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    description:
      'Collectez les données pour des finalités déterminées, explicites et légitimes. Ne les réutilisez pas pour d\'autres usages incompatibles sans nouveau consentement.',
    points: [
      'Définissez la finalité avant toute collecte',
      'Ne croisez pas des bases de données sans analyse de compatibilité',
      'Documentez chaque finalité dans votre registre des traitements',
    ],
  },
  {
    title: 'Minimisation des données',
    icon: Database,
    color: 'text-green-600',
    bg: 'bg-green-50',
    description:
      'Ne collectez que les données strictement nécessaires à la finalité poursuivie. Appliquez le principe du "Privacy by Design" dès la conception de vos outils.',
    points: [
      'Auditez régulièrement les champs collectés dans vos formulaires',
      'Supprimez les champs non utilisés de vos bases de données',
      'Questionnez chaque donnée : "Ai-je vraiment besoin de ceci ?"',
    ],
  },
  {
    title: 'Exactitude',
    icon: CheckCircle,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    description:
      'Les données doivent être exactes et tenues à jour. Mettez en place des processus pour corriger ou effacer les données inexactes.',
    points: [
      'Prévoyez un processus de mise à jour régulière des données clients',
      'Permettez aux personnes de corriger leurs données facilement',
      'Marquez les données obsolètes plutôt que de les archiver silencieusement',
    ],
  },
  {
    title: 'Limitation de la conservation',
    icon: Clock,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    description:
      'Fixez des durées de conservation pour chaque catégorie de données et automatisez la suppression ou l\'anonymisation à l\'échéance.',
    points: [
      'Prospects non convertis : 3 ans après le dernier contact',
      'Clients actifs : durée de la relation + obligations légales (5–10 ans)',
      'Logs techniques : 6 à 12 mois selon la finalité',
      'CV/candidatures : 2 ans maximum sans nouvelle collecte de consentement',
    ],
  },
  {
    title: 'Intégrité et confidentialité',
    icon: Lock,
    color: 'text-red-600',
    bg: 'bg-red-50',
    description:
      'Protégez les données contre les accès non autorisés, la perte et la destruction par des mesures techniques et organisationnelles adaptées.',
    points: [
      'Chiffrement des données au repos et en transit (TLS 1.2+)',
      'Gestion des accès : principe du moindre privilège',
      'Sauvegardes chiffrées et testées régulièrement',
      'Journalisation des accès aux données sensibles',
    ],
  },
]

const LEGAL_BASES = [
  { base: 'Consentement', article: 'Art. 6(1)(a)', color: 'bg-blue-100 text-blue-800', description: 'La personne a donné son accord explicite, librement, de manière spécifique et éclairée. Obligatoire pour la prospection commerciale par email.', example: 'Opt-in newsletter, cookies analytiques' },
  { base: 'Contrat', article: 'Art. 6(1)(b)', color: 'bg-green-100 text-green-800', description: 'Le traitement est nécessaire à l\'exécution d\'un contrat ou à des mesures précontractuelles.', example: 'Données client pour facturation, livraison' },
  { base: 'Obligation légale', article: 'Art. 6(1)(c)', color: 'bg-yellow-100 text-yellow-800', description: 'Le traitement est requis par la loi (droit français ou européen).', example: 'Conservation des factures 10 ans (Code de commerce)' },
  { base: 'Intérêt légitime', article: 'Art. 6(1)(f)', color: 'bg-purple-100 text-purple-800', description: 'Vos intérêts légitimes prévalent sur les droits des personnes (test de mise en balance obligatoire).', example: 'Prospection B2B, sécurité informatique, prévention fraude' },
  { base: 'Mission d\'intérêt public', article: 'Art. 6(1)(e)', color: 'bg-teal-100 text-teal-800', description: 'Traitement nécessaire à l\'exercice d\'une mission d\'intérêt public.', example: 'Organismes publics, autorités administratives' },
  { base: 'Sauvegarde des intérêts vitaux', article: 'Art. 6(1)(d)', color: 'bg-red-100 text-red-800', description: 'Traitement nécessaire pour protéger les intérêts vitaux de la personne.', example: 'Urgences médicales, sécurité physique' },
]

const RIGHTS = [
  { right: 'Droit d\'accès', article: 'Art. 15', delay: '1 mois', description: 'Toute personne peut demander une copie de ses données personnelles que vous détenez.' },
  { right: 'Droit de rectification', article: 'Art. 16', delay: '1 mois', description: 'Corriger des données inexactes ou incomplètes sans délai injustifié.' },
  { right: 'Droit à l\'effacement', article: 'Art. 17', delay: '1 mois', description: 'Suppression des données ("droit à l\'oubli") sous conditions (fin de finalité, retrait du consentement, etc.).' },
  { right: 'Droit à la portabilité', article: 'Art. 20', delay: '1 mois', description: 'Fournir les données dans un format structuré, couramment utilisé et lisible par machine.' },
  { right: 'Droit d\'opposition', article: 'Art. 21', delay: 'Immédiat', description: 'S\'opposer à un traitement fondé sur l\'intérêt légitime ou à des fins de prospection.' },
  { right: 'Droit à la limitation', article: 'Art. 18', delay: '1 mois', description: 'Geler un traitement contesté pendant la durée de vérification.' },
]

const SOVEREIGNTY_SECTIONS = [
  {
    title: 'Hébergement et localisation des données',
    icon: Server,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    items: [
      { label: 'Privilégiez les hébergeurs certifiés SecNumCloud (ANSSI)', detail: 'OVHcloud, 3DS Outscale, Scaleway, Thales (Cleyrop) — hébergement en France, soumis exclusivement au droit français/européen.' },
      { label: 'Évitez les transferts hors UE sans garanties', detail: 'Clauses contractuelles types (CCT) obligatoires pour tout transfert vers un pays tiers (USA, Inde, etc.). Vérifiez les sous-traitants de vos sous-traitants.' },
      { label: 'Contrats de sous-traitance RGPD (DPA)', detail: 'Tout prestataire traitant des données pour votre compte doit signer un Accord de Traitement des Données (DPA) conforme à l\'Art. 28 RGPD.' },
    ],
  },
  {
    title: 'Cloud souverain : labels et certifications',
    icon: ShieldCheck,
    color: 'text-green-600',
    bg: 'bg-green-50',
    items: [
      { label: 'SecNumCloud (ANSSI)', detail: 'Le référentiel de sécurité le plus exigeant en France. Garantit l\'immunité aux lois extraterritoriales (Cloud Act américain). Niveau le plus élevé pour les données sensibles.' },
      { label: 'HDS (Hébergeur de Données de Santé)', detail: 'Certification obligatoire pour toute solution hébergeant des données de santé à caractère personnel.' },
      { label: 'ISO 27001 + ISO 27017/27018', detail: 'Standards internationaux pour la sécurité de l\'information et la protection des données dans le cloud. Vérifiez la présence de ces certifications chez vos prestataires.' },
      { label: 'Eucs (European Cybersecurity Certification Scheme)', detail: 'Futur cadre européen de certification cloud, en cours de finalisation par l\'ENISA. Remplacera progressivement les labels nationaux.' },
    ],
  },
  {
    title: 'Clauses contractuelles essentielles',
    icon: FileText,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    items: [
      { label: 'Clause de localisation des données', detail: 'Exigez explicitement que vos données soient hébergées en France ou dans l\'UE, et que tout changement de localisation nécessite votre accord préalable.' },
      { label: 'Clause de réversibilité', detail: 'Prévoyez dès le départ les modalités de récupération de vos données en cas de fin de contrat (format, délai, coût nul).' },
      { label: 'Droit d\'audit', detail: 'Réservez-vous le droit d\'auditer votre prestataire ou de faire appel à un tiers mandaté pour vérifier la conformité.' },
      { label: 'Notification des violations', detail: 'Le prestataire doit vous notifier sous 24–48h toute violation ou incident de sécurité (vous avez 72h pour notifier la CNIL).' },
    ],
  },
  {
    title: 'Gouvernance et organisation interne',
    icon: Users,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    items: [
      { label: 'Registre des traitements (Art. 30 RGPD)', detail: 'Document obligatoire pour toutes les entreprises. Recensez chaque traitement : finalité, base légale, catégories de données, destinataires, durée de conservation, mesures de sécurité.' },
      { label: 'Analyse d\'impact (AIPD / PIA)', detail: 'Obligatoire pour les traitements à risque élevé (profilage, données sensibles, surveillance à grande échelle). Utilisez l\'outil PIA de la CNIL (open source).' },
      { label: 'Plan de réponse aux incidents', detail: 'Définissez qui fait quoi en cas de violation de données : détection, confinement, notification CNIL (72h), notification des personnes concernées si risque élevé.' },
      { label: 'Formation des équipes', detail: 'Sensibilisez vos collaborateurs annuellement : phishing, mots de passe, gestion des accès, que faire en cas de doute. La CNIL propose des supports gratuits.' },
    ],
  },
]

const TOOLS: ToolItem[] = [
  // Identité & accès
  { name: 'Keycloak', category: 'Identité & SSO', description: 'Solution IAM/SSO complète : authentification centralisée, OIDC, SAML 2.0, MFA, gestion des rôles. Standard de fait pour l\'entreprise.', url: 'https://www.keycloak.org', stars: '22k+', icon: Key, tags: ['IAM', 'SSO', 'OIDC', 'MFA'] },
  { name: 'Vaultwarden', category: 'Identité & SSO', description: 'Implémentation légère de Bitwarden en Rust. Gestionnaire de mots de passe auto-hébergé, compatible avec tous les clients Bitwarden.', url: 'https://github.com/dani-garcia/vaultwarden', stars: '40k+', icon: Lock, tags: ['Mots de passe', 'Auto-hébergé', 'Rust'] },

  // Stockage & collaboration
  { name: 'Nextcloud', category: 'Stockage & collaboration', description: 'Suite bureautique et stockage cloud souverain. Fichiers, agenda, contacts, visioconférence (Talk), formulaires, gestion de projets. RGPD-compliant.', url: 'https://nextcloud.com', stars: '28k+', icon: HardDrive, tags: ['Stockage', 'Collaboration', 'Souverain'] },
  { name: 'OnlyOffice', category: 'Stockage & collaboration', description: 'Suite bureautique en ligne compatible Microsoft Office (.docx, .xlsx, .pptx). S\'intègre nativement avec Nextcloud.', url: 'https://www.onlyoffice.com', stars: '5k+', icon: FileText, tags: ['Office', 'Documents', 'Collaboration'] },

  // Communication
  { name: 'Mattermost', category: 'Communication', description: 'Messagerie d\'équipe auto-hébergée (alternative Slack). Canaux, fils, intégrations, bots, conformité RGPD totale.', url: 'https://mattermost.com', stars: '31k+', icon: MessageSquare, tags: ['Messagerie', 'Équipe', 'Slack-like'] },
  { name: 'Jitsi Meet', category: 'Communication', description: 'Visioconférence open source, sans compte. Déployable en interne ou via meet.jit.si. Chiffrement de bout en bout optionnel.', url: 'https://jitsi.org', stars: '23k+', icon: Video, tags: ['Visio', 'Sans compte', 'Chiffré'] },
  { name: 'Mailu', category: 'Communication', description: 'Serveur mail complet auto-hébergé (SMTP, IMAP, webmail). Configuration Docker simple, inclut antispam et antivirus.', url: 'https://mailu.io', stars: '6k+', icon: Mail, tags: ['Email', 'Auto-hébergé', 'Docker'] },

  // CRM & gestion
  { name: 'Twenty CRM', category: 'CRM & gestion', description: 'CRM open source moderne (alternative HubSpot/Salesforce). API GraphQL, extensions, auto-hébergeable. Données 100% sous contrôle.', url: 'https://twenty.com', stars: '24k+', icon: Users, tags: ['CRM', 'GraphQL', 'Moderne'] },
  { name: 'Dolibarr', category: 'CRM & gestion', description: 'ERP/CRM français complet : clients, projets, facturation, comptabilité, stock, RH. Très répandu chez les PME françaises.', url: 'https://www.dolibarr.org', stars: '5k+', icon: Package, tags: ['ERP', 'Facturation', 'Français'] },
  { name: 'InvoiceNinja', category: 'CRM & gestion', description: 'Facturation, devis, suivi des paiements et temps. Interface moderne, multi-devises, multi-taxes, portail client.', url: 'https://invoiceninja.com', stars: '8k+', icon: FileText, tags: ['Facturation', 'Devis', 'Temps'] },

  // RGPD & conformité
  { name: 'PIA (CNIL)', category: 'RGPD & conformité', description: 'Outil officiel de la CNIL pour réaliser des Analyses d\'Impact relatives à la Protection des Données (AIPD). Gratuit, open source.', url: 'https://github.com/LINCnil/pia', stars: '700+', icon: Shield, tags: ['AIPD', 'CNIL', 'Officiel'] },
  { name: 'OpenDPIA', category: 'RGPD & conformité', description: 'Alternative open source pour la gestion du registre des traitements et des AIPD. Interface web, export PDF.', url: 'https://www.opendpia.com', stars: '', icon: Shield, tags: ['Registre', 'AIPD', 'Web'] },

  // Sécurité & monitoring
  { name: 'Uptime Kuma', category: 'Sécurité & monitoring', description: 'Monitoring de disponibilité auto-hébergé (alternative UptimeRobot). Alertes Slack, email, webhooks. Interface moderne.', url: 'https://github.com/louislam/uptime-kuma', stars: '62k+', icon: Bell, tags: ['Monitoring', 'Alertes', 'Auto-hébergé'] },
  { name: 'Grafana + Prometheus', category: 'Sécurité & monitoring', description: 'Stack de monitoring et observabilité de référence. Métriques, logs, alertes, tableaux de bord. Standard industrie.', url: 'https://grafana.com', stars: '65k+', icon: BarChart2, tags: ['Métriques', 'Dashboards', 'Alertes'] },
  { name: 'Wazuh', category: 'Sécurité & monitoring', description: 'SIEM open source : détection d\'intrusion, conformité (RGPD, PCI-DSS), analyse des logs, réponse aux incidents.', url: 'https://wazuh.com', stars: '11k+', icon: ShieldCheck, tags: ['SIEM', 'IDS', 'Conformité'] },
  { name: 'CrowdSec', category: 'Sécurité & monitoring', description: 'Protection collaborative contre les attaques. Détecte les comportements malveillants et partage les IOC avec la communauté.', url: 'https://www.crowdsec.net', stars: '9k+', icon: Shield, tags: ['Protection', 'IPS', 'Collaboratif'] },

  // Sauvegarde & infra
  { name: 'Restic', category: 'Sauvegarde & infra', description: 'Sauvegarde chiffrée, dédupliquée et vérifiable. Supporte S3, SFTP, B2, local. Restauration rapide et testable.', url: 'https://restic.net', stars: '27k+', icon: HardDrive, tags: ['Backup', 'Chiffré', 'Dédupliqué'] },
  { name: 'WireGuard', category: 'Sauvegarde & infra', description: 'VPN moderne, rapide et simple. Intégré au noyau Linux. Idéal pour sécuriser les accès distants aux ressources internes.', url: 'https://www.wireguard.com', stars: '5k+', icon: Wifi, tags: ['VPN', 'Réseau', 'Performant'] },
  { name: 'Traefik', category: 'Sauvegarde & infra', description: 'Reverse proxy et load balancer pour environnements Docker/Kubernetes. Gestion automatique des certificats Let\'s Encrypt.', url: 'https://traefik.io', stars: '51k+', icon: Server, tags: ['Proxy', 'TLS', 'Docker'] },

  // Signature & documents
  { name: 'DocuSeal', category: 'Signature & documents', description: 'Signature électronique open source auto-hébergée. Formulaires, champs, email d\'envoi, audit trail. Alternative à DocuSign.', url: 'https://www.docuseal.co', stars: '8k+', icon: FileText, tags: ['Signature', 'E-sign', 'Auto-hébergé'] },
  { name: 'Stirling PDF', category: 'Signature & documents', description: 'Boîte à outils PDF complète auto-hébergée. Fusion, split, OCR, compression, conversion, protection par mot de passe.', url: 'https://stirlingpdf.com', stars: '48k+', icon: FileText, tags: ['PDF', 'OCR', 'Compression'] },

  // Analytics
  { name: 'Matomo', category: 'Analytics', description: 'Analytics web respectueux de la vie privée (alternative Google Analytics). Auto-hébergé, données 100% propriétaires, exempté CNIL.', url: 'https://matomo.org', stars: '20k+', icon: BarChart2, tags: ['Analytics', 'RGPD', 'Exempté CNIL'] },
]

const TOOL_CATEGORIES = Array.from(new Set(TOOLS.map(t => t.category)))

// ─── Composant ───────────────────────────────────────────────────────────────

export default function GuidePage() {
  const [activeTab, setActiveTab] = useState<Tab>('rgpd')
  const [activeCategory, setActiveCategory] = useState<string>('Tous')
  const [expandedSection, setExpandedSection] = useState<number | null>(null)

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'rgpd', label: 'Bonnes pratiques RGPD', icon: Shield },
    { id: 'souverainete', label: 'Souveraineté numérique', icon: Globe },
    { id: 'outils', label: 'Outils open source', icon: Package },
  ]

  const filteredTools =
    activeCategory === 'Tous' ? TOOLS : TOOLS.filter(t => t.category === activeCategory)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={24} className="text-accessia-600" />
          Guide RGPD & Souveraineté numérique
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Bonnes pratiques, cadre réglementaire et outils open source recommandés pour les PME et entrepreneurs
        </p>
      </div>

      {/* Banner info */}
      <div className="bg-accessia-50 border border-accessia-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info size={18} className="text-accessia-600 shrink-0 mt-0.5" />
        <div className="text-sm text-accessia-800">
          <strong>Ce guide est destiné aux PME et entrepreneurs.</strong> Il ne remplace pas un conseil juridique.
          Pour toute question complexe, consultez un DPO qualifié ou un avocat spécialisé en droit numérique.
          Référence officielle : <a href="https://www.cnil.fr" target="_blank" rel="noreferrer" className="underline font-medium">cnil.fr</a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              activeTab === id
                ? 'bg-white text-accessia-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab RGPD ── */}
      {activeTab === 'rgpd' && (
        <div className="space-y-6">
          {/* 6 principes */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Shield size={18} className="text-accessia-600" />
              Les 6 principes fondamentaux du RGPD (Art. 5)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {RGPD_PRINCIPLES.map((p, i) => {
                const Icon = p.icon
                const open = expandedSection === i
                return (
                  <div key={i} className="bg-white rounded-xl border hover:shadow-sm transition-shadow">
                    <button
                      onClick={() => setExpandedSection(open ? null : i)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', p.bg)}>
                          <Icon size={16} className={p.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>
                        </div>
                        <ChevronRight size={14} className={clsx('shrink-0 text-gray-400 transition-transform mt-1', open && 'rotate-90')} />
                      </div>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 border-t pt-3 space-y-1">
                        {p.points.map((point, j) => (
                          <div key={j} className="flex items-start gap-2 text-xs text-gray-600">
                            <CheckCircle size={12} className="text-green-500 shrink-0 mt-0.5" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Bases légales */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-accessia-600" />
              Les 6 bases légales — Choisir la bonne (Art. 6)
            </h2>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="text-left p-3 w-40">Base légale</th>
                    <th className="text-left p-3 w-28">Article</th>
                    <th className="text-left p-3">Conditions</th>
                    <th className="text-left p-3">Exemple PME</th>
                  </tr>
                </thead>
                <tbody>
                  {LEGAL_BASES.map((b, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-3">
                        <span className={clsx('text-xs font-semibold px-2 py-1 rounded-full', b.color)}>{b.base}</span>
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-500">{b.article}</td>
                      <td className="p-3 text-xs text-gray-600">{b.description}</td>
                      <td className="p-3 text-xs text-gray-500 italic">{b.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <AlertTriangle size={11} />
              En B2B, l'intérêt légitime est souvent la base la plus appropriée pour la prospection commerciale. En B2C, le consentement est généralement requis.
            </p>
          </section>

          {/* Droits des personnes */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users size={18} className="text-accessia-600" />
              Droits des personnes — Délais de réponse obligatoires
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {RIGHTS.map((r, i) => (
                <div key={i} className="bg-white rounded-xl border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">{r.right}</p>
                    <span className="text-xs font-mono bg-accessia-50 text-accessia-700 px-2 py-0.5 rounded shrink-0 ml-2">{r.article}</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-3">{r.description}</p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock size={11} className="text-orange-500" />
                    <span className="text-orange-600 font-medium">Délai : {r.delay}</span>
                    <span className="text-gray-400">(extensible à 3 mois si complexe)</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Checklist rapide */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-accessia-600" />
              Checklist de conformité minimale PME
            </h2>
            <div className="bg-white rounded-xl border p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  'Registre des traitements rédigé et tenu à jour (Art. 30)',
                  'Politique de confidentialité publiée sur votre site',
                  'Contrats DPA signés avec tous vos sous-traitants',
                  'Mentions d\'information sur tous vos formulaires de collecte',
                  'Durées de conservation définies et automatisées',
                  'Procédure de réponse aux demandes d\'exercice de droits',
                  'Procédure de notification CNIL en cas de violation (72h)',
                  'Gestion des consentements pour cookies et email marketing',
                  'AIPD réalisées pour les traitements à risque élevé',
                  'Formation annuelle des collaborateurs sensibilisés',
                  'Accès aux données limité au principe du moindre privilège',
                  'Sauvegardes chiffrées et testées régulièrement',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <div className="w-4 h-4 border-2 border-gray-300 rounded mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Tab Souveraineté ── */}
      {activeTab === 'souverainete' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Globe size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <strong>La souveraineté numérique</strong> désigne la capacité à maîtriser les données, les infrastructures et les logiciels utilisés, en s'affranchissant des dépendances étrangères — notamment vis-à-vis des GAFAM soumis aux lois extraterritoriales (Cloud Act US, FISA).
            </div>
          </div>

          {SOVEREIGNTY_SECTIONS.map((section, i) => {
            const Icon = section.icon
            return (
              <section key={i}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Icon size={18} className={section.color} />
                  {section.title}
                </h2>
                <div className="space-y-3">
                  {section.items.map((item, j) => (
                    <div key={j} className="bg-white rounded-xl border p-4 flex gap-4">
                      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', section.bg)}>
                        <Zap size={14} className={section.color} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">{item.label}</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}

          {/* Hébergeurs souverains */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Star size={18} className="text-accessia-600" />
              Hébergeurs cloud souverains recommandés (France/UE)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: 'OVHcloud', country: '🇫🇷 France', cert: 'SecNumCloud', desc: 'Leader européen, datacenters en France, offres IaaS/PaaS/SaaS souveraines. Qualifié SecNumCloud pour certaines offres.', url: 'https://ovhcloud.com' },
                { name: 'Scaleway', country: '🇫🇷 France', cert: 'ISO 27001', desc: 'Filiale d\'Iliad, hébergement à Paris et Amsterdam. Bonne alternative économique, instances arm64 économes en énergie.', url: 'https://www.scaleway.com' },
                { name: 'Infomaniak', country: '🇨🇭 Suisse', cert: 'ISO 27001', desc: 'Hébergeur suisse éthique et écologique. RGPD natif, datacenters en Suisse, offres collaboratives (kDrive, kMeet).', url: 'https://www.infomaniak.com' },
                { name: 'Hetzner', country: '🇩🇪 Allemagne', cert: 'ISO 27001', desc: 'Excellent rapport qualité/prix, datacenters en Allemagne et Finlande. Respecte strictement le RGPD/droit allemand.', url: 'https://www.hetzner.com' },
                { name: 'Outscale (3DS)', country: '🇫🇷 France', cert: 'SecNumCloud', desc: 'Filiale de Dassault Systèmes. Plateforme IaaS qualifiée SecNumCloud, ciblant administrations et secteurs régulés.', url: 'https://fr.outscale.com' },
                { name: 'Clever Cloud', country: '🇫🇷 France', cert: 'ISO 27001', desc: 'PaaS français orienté développeurs. Déploiement automatisé, scaling, bases de données managées. Localisé en France.', url: 'https://www.clever-cloud.com' },
              ].map((h, i) => (
                <a key={i} href={h.url} target="_blank" rel="noreferrer"
                  className="bg-white rounded-xl border p-4 hover:shadow-sm hover:border-accessia-300 transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900 group-hover:text-accessia-600">{h.name}</p>
                      <p className="text-xs text-gray-400">{h.country}</p>
                    </div>
                    <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{h.cert}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{h.desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-accessia-600">
                    <ExternalLink size={11} />
                    <span>{h.url.replace('https://', '')}</span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Tab Outils ── */}
      {activeTab === 'outils' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              {TOOLS.length} outils open source, gratuits, documentés et auto-hébergeables — alternatives souveraines aux solutions propriétaires.
            </p>
          </div>

          {/* Filtre catégories */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory('Tous')}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                activeCategory === 'Tous'
                  ? 'bg-accessia-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Tous ({TOOLS.length})
            </button>
            {TOOL_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={clsx(
                  'text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                  activeCategory === cat
                    ? 'bg-accessia-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {cat} ({TOOLS.filter(t => t.category === cat).length})
              </button>
            ))}
          </div>

          {/* Grille outils */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTools.map((tool, i) => {
              const Icon = tool.icon
              return (
                <a
                  key={i}
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-white rounded-xl border p-4 hover:shadow-sm hover:border-accessia-300 transition-all group flex flex-col"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-accessia-50 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-accessia-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-gray-900 group-hover:text-accessia-600">{tool.name}</p>
                        {tool.stars && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5 shrink-0">
                            <Star size={10} className="fill-yellow-400 text-yellow-400" />
                            {tool.stars}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-accessia-500 font-medium">{tool.category}</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed flex-1 mb-3">{tool.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {tool.tags.map((tag, j) => (
                        <span key={j} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <ExternalLink size={12} className="text-gray-300 group-hover:text-accessia-400 shrink-0 ml-2 transition-colors" />
                  </div>
                </a>
              )
            })}
          </div>

          {/* Note de bas de page */}
          <div className="bg-gray-50 rounded-xl border p-4 text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">Note :</strong> Tous les outils listés sont open source (licences OSI-approved), maintenus activement et auto-hébergeables. Les étoiles GitHub indiquent la popularité communautaire. Vérifiez toujours la licence et la politique de sécurité avant déploiement en production.
            Les liens pointent vers les sites officiels ou dépôts GitHub des projets.
          </div>
        </div>
      )}
    </div>
  )
}
