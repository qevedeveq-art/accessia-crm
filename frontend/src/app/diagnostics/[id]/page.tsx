'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  getDiagnostic, updateDiagnostic, getDiagnosticPdfUrl,
  regenerateShareToken, DiagnosticItem, createTask,
} from '@/lib/api'
import Link from 'next/link'
import {
  ArrowLeft, Download, Share2, Copy, Check, ChevronLeft, ChevronRight,
  Shield, Brain, AlertTriangle, CheckCircle2, Clock, ExternalLink,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// QUESTIONNAIRE DATA — CYBER
// ═══════════════════════════════════════════════════════════════

const CYBER_SECTIONS = [
  {
    id: "referent", title: "1. Référent cybersécurité", icon: "🛡️",
    desc: "Gouvernance et responsabilité de la sécurité informatique",
    questions: [
      { id: "ref_designe", text: "Un référent cybersécurité est-il officiellement désigné dans votre entreprise ?", options: ["Oui, avec une fiche de poste dédiée", "Oui, mais de manière informelle", "Non, personne n'est identifié", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "ref_forme", text: "Ce référent a-t-il suivi une formation en cybersécurité ?", options: ["Oui, formation certifiante ou équivalente", "Oui, autoformation ou sensibilisation", "Non, aucune formation", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "ref_missions", text: "Les missions du référent sont-elles clairement définies ?", options: ["Oui, documentées et communiquées", "Partiellement définies", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Désigner un référent cybersécurité officiel", "Inscrire le référent à la formation SecNumAcadémie de l'ANSSI", "Rédiger une fiche de poste avec les responsabilités cyber"],
      intermediaire: ["Formaliser et documenter les missions du référent", "Planifier une formation certifiante (ISO 27001 Lead Implementer)"],
      avance: ["Maintenir les certifications à jour", "Mettre en place une veille cybersécurité régulière"],
    },
  },
  {
    id: "inventaire", title: "2. Connaissance du SI", icon: "🖥️",
    desc: "Cartographie des équipements, logiciels et données sensibles",
    questions: [
      { id: "inv_materiel", text: "Disposez-vous d'un inventaire à jour de tous vos équipements ?", options: ["Oui, inventaire complet et mis à jour", "Partiellement", "Non, aucun inventaire", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "inv_logiciel", text: "Avez-vous un inventaire des logiciels et applications utilisées ?", options: ["Oui, avec versions et licences", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "inv_donnees", text: "Les données sensibles sont-elles identifiées et classifiées ?", options: ["Oui, classification formelle", "Partiellement identifiées", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "inv_schema", text: "Disposez-vous d'un schéma réseau à jour ?", options: ["Oui, documenté et maintenu", "Ancien ou incomplet", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Réaliser un inventaire complet du matériel et des logiciels", "Identifier et classifier les données sensibles", "Cartographier le réseau informatique"],
      intermediaire: ["Automatiser la mise à jour de l'inventaire (GLPI, Snipe-IT)", "Formaliser la classification des données (publiques, internes, confidentielles)"],
      avance: ["Mettre en place un CMDB (Configuration Management Database)", "Auditer régulièrement la conformité de l'inventaire"],
    },
  },
  {
    id: "sauvegardes", title: "3. Sauvegardes", icon: "💾",
    desc: "Stratégie de sauvegarde et plan de reprise",
    questions: [
      { id: "sav_reguliere", text: "Effectuez-vous des sauvegardes régulières de vos données critiques ?", options: ["Oui, automatiques et quotidiennes", "Oui, mais irrégulières", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sav_regle", text: "Appliquez-vous la règle 3-2-1 (3 copies, 2 supports, 1 hors site) ?", options: ["Oui", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sav_test", text: "Testez-vous régulièrement la restauration de vos sauvegardes ?", options: ["Oui, tests réguliers documentés", "Rarement", "Jamais", "N/A"], weights: [3, 1, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Mettre en place des sauvegardes automatiques quotidiennes", "Appliquer la règle 3-2-1", "Externaliser au moins une copie (cloud ou site distant)"],
      intermediaire: ["Tester la restauration au moins une fois par trimestre", "Chiffrer les sauvegardes externalisées"],
      avance: ["Automatiser les tests de restauration", "Documenter le PRA (Plan de Reprise d'Activité)"],
    },
  },
  {
    id: "mises_a_jour", title: "4. Mises à jour", icon: "🔄",
    desc: "Gestion des correctifs et mises à jour de sécurité",
    questions: [
      { id: "maj_os", text: "Les systèmes d'exploitation sont-ils maintenus à jour ?", options: ["Oui, mises à jour automatiques", "Partiellement", "Non ou OS obsolètes", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "maj_logiciels", text: "Les logiciels et applications sont-ils à jour ?", options: ["Oui, politique de mises à jour suivie", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "maj_firmware", text: "Le firmware des équipements réseau est-il mis à jour ?", options: ["Oui, régulièrement", "Rarement", "Jamais / ne sais pas", "N/A"], weights: [3, 1, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Activer les mises à jour automatiques sur tous les postes", "Remplacer les systèmes en fin de vie (ex: Windows 7/8)", "Établir un calendrier de mise à jour mensuel"],
      intermediaire: ["Centraliser la gestion des mises à jour (WSUS, Intune)", "Inclure les équipements réseau dans le cycle de mise à jour"],
      avance: ["Mettre en place une veille vulnérabilités (CVE)", "Tester les mises à jour critiques avant déploiement"],
    },
  },
  {
    id: "antivirus", title: "5. Antivirus & Pare-feu", icon: "🔒",
    desc: "Protection des postes et du réseau",
    questions: [
      { id: "av_installe", text: "Un antivirus/EDR est-il installé et à jour sur tous les postes ?", options: ["Oui, solution EDR/antivirus gérée centralement", "Oui, antivirus basique", "Non ou incomplet", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "av_parefeu", text: "Un pare-feu est-il configuré sur le réseau et les postes ?", options: ["Oui, UTM/pare-feu dédié + pare-feu local", "Pare-feu basique (box internet)", "Non configuré", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "av_analyse", text: "Les alertes de sécurité sont-elles analysées et traitées ?", options: ["Oui, processus défini", "Parfois, au cas par cas", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Déployer un antivirus/EDR sur tous les postes", "Configurer le pare-feu Windows/macOS sur chaque poste", "Activer les analyses programmées"],
      intermediaire: ["Passer à une solution EDR gérée centralement", "Investir dans un pare-feu UTM dédié"],
      avance: ["Mettre en place un SOC ou service de surveillance 24/7", "Effectuer des tests de pénétration réguliers"],
    },
  },
  {
    id: "authentification", title: "6. Authentification", icon: "🔑",
    desc: "Gestion des mots de passe et accès",
    questions: [
      { id: "auth_politique", text: "Existe-t-il une politique de mots de passe (longueur, complexité) ?", options: ["Oui, appliquée techniquement", "Oui, mais pas toujours respectée", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "auth_mfa", text: "L'authentification multi-facteurs (MFA) est-elle activée ?", options: ["Oui, sur tous les comptes critiques", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "auth_gestionnaire", text: "Utilisez-vous un gestionnaire de mots de passe ?", options: ["Oui, déployé dans l'entreprise", "Quelques personnes", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Définir une politique de mots de passe (12+ caractères)", "Activer le MFA sur les comptes email et cloud", "Déployer un gestionnaire de mots de passe (Bitwarden, 1Password)"],
      intermediaire: ["Étendre le MFA à toutes les applications", "Mettre en place le SSO (Single Sign-On)"],
      avance: ["Évoluer vers l'authentification sans mot de passe (FIDO2)", "Auditer régulièrement les comptes et accès"],
    },
  },
  {
    id: "sensibilisation", title: "7. Sensibilisation", icon: "📖",
    desc: "Formation et sensibilisation du personnel",
    questions: [
      { id: "sens_formation", text: "Les collaborateurs sont-ils formés aux bonnes pratiques cyber ?", options: ["Oui, formations régulières", "Une seule fois ou ponctuellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sens_phishing", text: "Des tests de phishing sont-ils réalisés ?", options: ["Oui, régulièrement", "Oui, une fois", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sens_charte", text: "Existe-t-il une charte informatique signée par les collaborateurs ?", options: ["Oui, à jour et signée", "Existe mais ancienne", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Organiser une première session de sensibilisation cyber", "Rédiger et faire signer une charte informatique", "Diffuser les bons réflexes anti-phishing"],
      intermediaire: ["Planifier des formations trimestrielles", "Lancer des campagnes de test de phishing"],
      avance: ["Gamifier la sensibilisation (quiz, challenges)", "Intégrer la cyber dans l'onboarding des nouveaux collaborateurs"],
    },
  },
  {
    id: "reseau", title: "8. Sécurité réseau", icon: "🌐",
    desc: "Wi-Fi, segmentation, accès distant",
    questions: [
      { id: "net_wifi", text: "Le Wi-Fi est-il sécurisé (WPA3/WPA2-Enterprise, réseau invité séparé) ?", options: ["Oui, Wi-Fi segmenté et sécurisé", "WPA2 basique, pas de séparation", "Wi-Fi ouvert ou non sécurisé", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "net_vpn", text: "L'accès distant est-il sécurisé (VPN, Zero Trust) ?", options: ["Oui, VPN ou solution Zero Trust", "VPN basique", "Non, accès direct", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "net_segment", text: "Le réseau est-il segmenté (serveurs/postes/IoT séparés) ?", options: ["Oui, VLANs en place", "Partiellement", "Non, réseau plat", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Configurer le Wi-Fi en WPA2/WPA3 avec un réseau invité séparé", "Mettre en place un VPN pour les accès distants", "Changer les mots de passe par défaut des équipements réseau"],
      intermediaire: ["Segmenter le réseau en VLANs", "Déployer une solution Zero Trust Network Access"],
      avance: ["Implémenter un système de détection d'intrusion (IDS/IPS)", "Auditer régulièrement la configuration réseau"],
    },
  },
  {
    id: "email", title: "9. Messagerie & phishing", icon: "📧",
    desc: "Sécurité de la messagerie électronique",
    questions: [
      { id: "em_antispam", text: "Un filtre anti-spam / anti-phishing est-il en place ?", options: ["Oui, solution avancée (ATP, Defender)", "Filtre basique du fournisseur", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "em_spf", text: "Les protocoles SPF/DKIM/DMARC sont-ils configurés ?", options: ["Oui, les trois", "Partiellement", "Non / ne sais pas", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Activer le filtre anti-spam/phishing avancé", "Configurer SPF et DKIM sur votre domaine"],
      intermediaire: ["Déployer DMARC en mode quarantine/reject", "Former les utilisateurs à identifier les emails suspects"],
      avance: ["Mettre en place une solution ATP (Advanced Threat Protection)", "Simuler régulièrement des attaques de phishing"],
    },
  },
  {
    id: "mobilite", title: "10. Mobilité & BYOD", icon: "📱",
    desc: "Sécurisation des appareils mobiles et personnels",
    questions: [
      { id: "mob_mdm", text: "Les appareils mobiles professionnels sont-ils gérés (MDM) ?", options: ["Oui, solution MDM déployée", "Partiellement (config manuelle)", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "mob_chiffrement", text: "Les disques durs des portables sont-ils chiffrés ?", options: ["Oui, BitLocker/FileVault activé", "Sur certains postes", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Activer le chiffrement sur tous les portables", "Définir une politique BYOD claire"],
      intermediaire: ["Déployer une solution MDM (Intune, Jamf)", "Imposer un code PIN/biométrie sur les mobiles pros"],
      avance: ["Implémenter le MAM (Mobile Application Management)", "Effacement à distance en cas de perte/vol"],
    },
  },
  {
    id: "incident", title: "11. Gestion des incidents", icon: "🚨",
    desc: "Détection, réponse et communication en cas d'incident",
    questions: [
      { id: "inc_procedure", text: "Existe-t-il une procédure de gestion des incidents cyber ?", options: ["Oui, documentée et testée", "Informelle", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "inc_contact", text: "Les contacts d'urgence sont-ils identifiés (prestataire, ANSSI, assurance) ?", options: ["Oui, liste maintenue à jour", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "inc_assurance", text: "Avez-vous une assurance cyber ?", options: ["Oui", "En cours", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Rédiger une procédure de gestion des incidents", "Identifier les contacts d'urgence (ANSSI : cert-fr.cossi@ssi.gouv.fr)", "Évaluer l'intérêt d'une assurance cyber"],
      intermediaire: ["Tester la procédure d'incident par un exercice", "Souscrire une assurance cyber adaptée"],
      avance: ["Mener des exercices de crise réguliers", "Mettre en place un SIEM pour la détection"],
    },
  },
  {
    id: "rgpd", title: "12. Conformité RGPD", icon: "📋",
    desc: "Protection des données personnelles",
    questions: [
      { id: "rgpd_registre", text: "Tenez-vous un registre des traitements de données personnelles ?", options: ["Oui, à jour", "Incomplet ou ancien", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "rgpd_dpo", text: "Un DPO (Data Protection Officer) est-il désigné ?", options: ["Oui, interne ou externe", "Non mais en projet", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "rgpd_droits", text: "Les droits des personnes (accès, suppression) peuvent-ils être exercés ?", options: ["Oui, processus en place", "Partiellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Créer un registre des traitements (modèle CNIL)", "Nommer un référent RGPD", "Mettre à jour les mentions légales du site web"],
      intermediaire: ["Désigner un DPO (externe si besoin)", "Mettre en place un processus de gestion des demandes de droits"],
      avance: ["Réaliser un AIPD (Analyse d'Impact) pour les traitements à risque", "Auditer régulièrement la conformité RGPD"],
    },
  },
  {
    id: "continuite", title: "13. Continuité d'activité", icon: "🏗️",
    desc: "Résilience et plan de continuité",
    questions: [
      { id: "cont_pca", text: "Disposez-vous d'un PCA/PRA (Plan de Continuité / Reprise d'Activité) ?", options: ["Oui, testé et à jour", "Existe mais non testé", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "cont_impact", text: "Connaissez-vous le temps d'arrêt maximal tolérable pour votre activité ?", options: ["Oui, RTO/RPO définis", "Approximativement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Identifier les processus critiques et le temps d'arrêt maximal", "Rédiger un PRA simplifié", "Documenter les procédures de redémarrage"],
      intermediaire: ["Formaliser le PCA/PRA complet", "Tester le PRA par un exercice de restauration"],
      avance: ["Automatiser la bascule (failover)", "Réaliser un exercice de crise annuel complet"],
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// QUESTIONNAIRE DATA — IA
// ═══════════════════════════════════════════════════════════════

const IA_SECTIONS = [
  {
    id: "maturite", title: "1. Maturité digitale & données", icon: "📊",
    desc: "Évaluation du socle numérique et de la qualité des données",
    questions: [
      { id: "mat_outils", text: "Quels outils numériques utilisez-vous au quotidien ?", options: ["Suite complète (ERP/CRM, cloud, collaboration)", "Quelques outils (email, bureautique, 1-2 SaaS)", "Principalement papier/Excel, peu de digital", "N/A"], weights: [3, 1.5, 0.5, 0], max: 3 },
      { id: "mat_donnees", text: "Vos données métier sont-elles structurées et centralisées ?", options: ["Oui, dans un CRM/ERP centralisé", "Partiellement (tableurs + quelques outils)", "Non, données éparpillées", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "mat_volume", text: "Quel volume de données exploitables estimez-vous avoir ?", options: ["Important (milliers de fiches, historique > 2 ans)", "Moyen (centaines de fiches, 1-2 ans)", "Faible ou non exploitables", "N/A"], weights: [3, 1.5, 0.5, 0], max: 3 },
      { id: "mat_qualite", text: "La qualité de vos données est-elle fiable ?", options: ["Oui, nettoyage régulier", "Correcte avec quelques problèmes", "Non, incomplètes ou obsolètes", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Migrer vers un outil cloud collaboratif (Google Workspace, Microsoft 365)", "Nettoyer et structurer les données existantes", "Former l'équipe aux outils numériques de base"],
      intermediaire: ["Centraliser les données dans un CRM/ERP", "Mettre en place des processus de qualité des données"],
      avance: ["Construire un data lake PME pour analyses avancées", "Automatiser le nettoyage et enrichissement des données"],
    },
  },
  {
    id: "commercial", title: "2. Vente & Relation client", icon: "🤝",
    desc: "Processus commerciaux, prospection, fidélisation",
    questions: [
      { id: "com_prospection", text: "Comment gérez-vous la prospection et les leads ?", options: ["CRM avec scoring/pipeline automatisé", "CRM basique ou tableur structuré", "Carnet d'adresses / bouche à oreille", "N/A"], weights: [3, 1.5, 0.5, 0], max: 3 },
      { id: "com_devis", text: "Comment sont gérés vos devis ?", options: ["Générés automatiquement depuis un outil", "Modèles manuels (Word/Excel)", "Rédigés de zéro à chaque fois", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "com_sav", text: "Comment est géré le support client ?", options: ["Outil de ticketing structuré", "Email + tableur", "Pas de suivi formalisé", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "com_satisfaction", text: "Mesurez-vous la satisfaction client ?", options: ["Oui, enquêtes régulières + analyse", "Ponctuellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "com_email", text: "Volume d'emails/communications sortantes par semaine ?", options: ["> 100", "20 à 100", "< 20", "N/A"], weights: [3, 2, 1, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Déployer un chatbot IA pour le service client", "Utiliser l'IA pour rédiger les emails commerciaux", "Automatiser la génération de devis"],
      intermediaire: ["Mettre en place le scoring prédictif des leads", "Analyser le sentiment des retours clients par IA"],
      avance: ["Déployer un assistant commercial IA personnalisé", "Prédiction du churn et actions de rétention automatisées"],
    },
  },
  {
    id: "production", title: "3. Production & Opérations", icon: "⚙️",
    desc: "Processus opérationnels, logistique, planification",
    questions: [
      { id: "prod_repetitif", text: "Quelles tâches répétitives consomment le plus de temps ?", options: ["Saisie de données, copier-coller", "Reporting, tableaux de bord", "Planification manuelle", "N/A"], weights: [3, 2.5, 2, 0], max: 3 },
      { id: "prod_planif", text: "Comment planifiez-vous vos ressources ?", options: ["Outil spécialisé (ERP, GPAO)", "Tableur ou agenda partagé", "De tête / téléphone / papier", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "prod_documents", text: "Volume de documents à traiter par mois ?", options: ["> 200 documents/mois", "50 à 200", "< 50", "N/A"], weights: [3, 2, 1, 0], max: 3 },
      { id: "prod_erreurs", text: "Fréquence d'erreurs de saisie ou oublis ?", options: ["Rarement (bien contrôlé)", "Régulièrement (quelques/semaine)", "Fréquemment (impact qualité/coûts)", "N/A"], weights: [1, 2.5, 3, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Automatiser les saisies avec Make/Zapier/n8n", "Extraction automatique de données depuis documents (OCR + IA)", "Tableaux de bord automatisés (Metabase, Looker Studio)"],
      intermediaire: ["Planification intelligente des ressources par IA", "Automatisation des workflows inter-applications"],
      avance: ["Maintenance prédictive (IoT + IA)", "Optimisation de la chaîne logistique par IA"],
    },
  },
  {
    id: "rh", title: "4. Ressources humaines", icon: "👥",
    desc: "Gestion du personnel, recrutement, administration",
    questions: [
      { id: "rh_effectif", text: "Nombre de collaborateurs ?", options: ["Plus de 50", "10 à 50", "Moins de 10", "N/A"], weights: [3, 2, 1, 0], max: 3 },
      { id: "rh_recrutement", text: "Le recrutement est-il un enjeu récurrent ?", options: ["Oui, > 10 recrutements/an", "Quelques recrutements/an", "Peu de recrutement", "N/A"], weights: [3, 2, 0.5, 0], max: 3 },
      { id: "rh_admin", text: "Gestion administrative RH ?", options: ["Logiciel SIRH / plateforme", "Tableurs + processus manuels", "Tout sur papier / email", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "rh_formation", text: "Identification des besoins de formation ?", options: ["Processus formalisé", "Informel, au cas par cas", "Pas de suivi", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Pré-tri automatique des CV par IA", "Assistant FAQ interne pour les questions RH", "Automatiser les tâches admin RH"],
      intermediaire: ["Détection des risques de turnover par IA", "Parcours de formation personnalisé par IA"],
      avance: ["People analytics avancé", "Assistant RH IA complet (onboarding, suivi, formation)"],
    },
  },
  {
    id: "finance", title: "5. Finance & Comptabilité", icon: "💰",
    desc: "Facturation, trésorerie, reporting financier",
    questions: [
      { id: "fin_facturation", text: "Comment est gérée la facturation ?", options: ["Logiciel automatisé", "Modèles manuels + comptable", "Pas structuré", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "fin_relance", text: "Gestion des relances de paiement ?", options: ["Relances automatiques", "Suivi manuel", "Pas systématique", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "fin_reporting", text: "Fréquence des indicateurs financiers ?", options: ["Temps réel ou hebdo", "Mensuel", "Trimestriel ou moins", "N/A"], weights: [3, 2, 0.5, 0], max: 3 },
      { id: "fin_prevision", text: "Prévision financière ?", options: ["Oui, outils dédiés", "Oui, manuellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Rapprochement bancaire automatique par IA", "Relances de paiement automatiques intelligentes", "Détection d'anomalies sur les dépenses"],
      intermediaire: ["Prévision de trésorerie par IA (Prophet, Agicap)", "Tableaux de bord financiers temps réel"],
      avance: ["Modèle prédictif de cash-flow", "Optimisation automatique du BFR"],
    },
  },
  {
    id: "marketing", title: "6. Marketing & Communication", icon: "📣",
    desc: "Présence digitale, contenu, campagnes",
    questions: [
      { id: "mkt_presence", text: "Présence en ligne active ?", options: ["Site + réseaux actifs", "Site basique + réseaux peu actifs", "Très limitée", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "mkt_contenu", text: "Temps consacré à la création de contenu ?", options: ["> 5h/semaine", "1 à 5h/semaine", "Quasiment rien", "N/A"], weights: [3, 2, 0.5, 0], max: 3 },
      { id: "mkt_campagnes", text: "Campagnes marketing régulières ?", options: ["Oui, avec suivi KPIs", "Ponctuellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "mkt_analyse", text: "Analyse des performances marketing ?", options: ["Oui, KPIs suivis", "Parfois", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Génération de contenu par IA (articles, posts, newsletters)", "Visuels marketing par IA (Midjourney, DALL-E, Canva AI)", "Automatiser les publications réseaux sociaux"],
      intermediaire: ["Personnalisation des campagnes email par IA", "SEO automatisé par IA"],
      avance: ["Attribution marketing multi-canal par IA", "Stratégie de contenu pilotée par la data"],
    },
  },
  {
    id: "connaissance", title: "7. Gestion des connaissances", icon: "📚",
    desc: "Base de connaissances, documentation interne",
    questions: [
      { id: "doc_base", text: "Base de connaissances documentée ?", options: ["Oui, centralisée et à jour", "Partiellement (documents dispersés)", "Non, tout dans la tête des gens", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "doc_recherche", text: "Facilité à trouver l'information ?", options: ["Oui, recherche efficace", "Difficilement", "Non, info inaccessible", "N/A"], weights: [3, 1, 0, 0], max: 3 },
      { id: "doc_volume", text: "Volume de documentation ?", options: ["> 500 documents", "50 à 500", "< 50", "N/A"], weights: [3, 2, 1, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Chatbot RAG sur la documentation interne", "Résumé automatique de documents et réunions", "Centraliser la documentation (wiki, Notion)"],
      intermediaire: ["Base de connaissances intelligente avec détection d'obsolescence", "Recherche sémantique dans les documents"],
      avance: ["Agent IA expert métier alimenté par toute la documentation", "Génération automatique de procédures"],
    },
  },
  {
    id: "strategie", title: "8. Vision & Stratégie IA", icon: "🎯",
    desc: "Appétence, budget, contraintes, expérience",
    questions: [
      { id: "str_appetence", text: "Niveau d'intérêt de la direction pour l'IA ?", options: ["Fort — dans la stratégie", "Modéré — curieux", "Faible — sceptique", "N/A"], weights: [3, 1.5, 0.5, 0], max: 3 },
      { id: "str_budget", text: "Budget mensuel pour outils IA ?", options: ["> 500 €/mois", "100 à 500 €/mois", "< 100 € ou aucun", "N/A"], weights: [3, 2, 1, 0], max: 3 },
      { id: "str_contraintes", text: "Contraintes réglementaires sectorielles ?", options: ["Fortes (santé, finance, défense)", "Modérées (RGPD standard)", "Peu de contraintes", "N/A"], weights: [1, 2, 3, 0], max: 3 },
      { id: "str_experience", text: "Avez-vous déjà utilisé des outils IA ?", options: ["Oui, utilisation régulière", "Quelques tests", "Jamais", "N/A"], weights: [3, 1.5, 0.5, 0], max: 3 },
      { id: "str_priorite", text: "Objectif prioritaire ?", options: ["Gagner du temps", "Améliorer la qualité", "Augmenter le CA", "N/A"], weights: [3, 3, 3, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Formation IA pour la direction et les équipes (atelier 2-4h)", "POC sur un cas d'usage prioritaire", "Commencer par des outils IA no-code"],
      intermediaire: ["Feuille de route IA sur 12 mois", "Investir dans 2-3 outils IA ciblés"],
      avance: ["Co-développer un assistant IA métier sur mesure", "Intégrer l'IA dans la stratégie d'entreprise"],
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// QUESTIONNAIRE DATA — RGPD
// ═══════════════════════════════════════════════════════════════

const RGPD_SECTIONS = [
  {
    id: "gouvernance", title: "1. Gouvernance & Responsabilité", icon: "⚖️",
    desc: "DPO, registre des traitements, politique de protection des données",
    questions: [
      { id: "gov_dpo", text: "Un Délégué à la Protection des Données (DPO) est-il désigné ?", options: ["Oui, DPO désigné et notifié à la CNIL", "Oui, référent interne mais non notifié", "Non, personne n'est identifié", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "gov_registre", text: "Disposez-vous d'un registre des activités de traitement tenu à jour ?", options: ["Oui, complet et régulièrement mis à jour", "Existe mais incomplet ou obsolète", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "gov_politique", text: "Une politique de protection des données est-elle formalisée ?", options: ["Oui, diffusée et signée par les collaborateurs", "Existe mais non diffusée", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "gov_sensibilisation", text: "Les collaborateurs sont-ils formés/sensibilisés au RGPD ?", options: ["Oui, formation annuelle obligatoire", "Sensibilisation ponctuelle", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Désigner un DPO ou référent RGPD et le notifier à la CNIL si obligatoire", "Créer et maintenir un registre des traitements (modèle CNIL disponible)", "Rédiger une politique RGPD interne et la faire signer par les équipes"],
      intermediaire: ["Planifier des formations RGPD annuelles pour tous les collaborateurs", "Auditer le registre chaque trimestre"],
      avance: ["Mettre en place un programme de conformité RGPD continu", "Effectuer des audits internes RGPD réguliers"],
    },
  },
  {
    id: "droits_personnes", title: "2. Droits des Personnes", icon: "👤",
    desc: "Consentement, droit d'accès, rectification, effacement, portabilité",
    questions: [
      { id: "dp_consentement", text: "Le recueil du consentement est-il valide (libre, éclairé, spécifique, univoque) ?", options: ["Oui, conformité vérifiée (cases opt-in, granularité)", "Partiellement (cases pré-cochées ou formulation vague)", "Non conforme ou absent", "N/A"], weights: [3, 1, 0, 0], max: 3 },
      { id: "dp_acces", text: "Pouvez-vous répondre à une demande d'accès aux données en moins de 30 jours ?", options: ["Oui, procédure formalisée et testée", "Oui, mais de manière ad hoc", "Non, pas de procédure", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "dp_effacement", text: "Les demandes d'effacement (droit à l'oubli) sont-elles traitées ?", options: ["Oui, procédure automatisée ou formalisée", "Oui, manuellement au cas par cas", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "dp_portabilite", text: "Pouvez-vous fournir les données dans un format structuré et réutilisable ?", options: ["Oui, export automatique disponible (JSON, CSV)", "Oui, manuellement", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Revoir les bannières cookies et formulaires de consentement (opt-in explicite)", "Créer une procédure documentée pour traiter les demandes d'exercice de droits", "Mettre en place une adresse email dédiée : rgpd@votreentreprise.fr"],
      intermediaire: ["Automatiser le traitement des demandes de droits dans le CRM", "Tester la procédure de portabilité avec un cas réel"],
      avance: ["Déployer un portail de gestion des droits en libre-service", "Intégrer la gestion des droits dans les APIs produit"],
    },
  },
  {
    id: "securite", title: "3. Sécurité des Données", icon: "🔐",
    desc: "Chiffrement, contrôle d'accès, pseudonymisation, journalisation",
    questions: [
      { id: "sec_chiffrement", text: "Les données personnelles au repos et en transit sont-elles chiffrées ?", options: ["Oui, chiffrement end-to-end systématique", "Partiellement (ex: transit chiffré, pas le stockage)", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sec_acces", text: "Les accès aux données personnelles sont-ils contrôlés par le principe du moindre privilège ?", options: ["Oui, RBAC strict et revue régulière des droits", "Partiellement", "Non, accès large", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sec_pseudonymisation", text: "La pseudonymisation ou anonymisation est-elle appliquée pour les traitements analytiques ?", options: ["Oui, systématiquement", "Parfois", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "sec_logs", text: "Les accès et modifications de données personnelles sont-ils journalisés (logs) ?", options: ["Oui, logs avec rétention définie et alertes", "Logs existants non exploités", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Chiffrer les bases de données contenant des données personnelles (AES-256)", "Mettre en place un contrôle d'accès basé sur les rôles (RBAC)", "Activer la journalisation des accès aux systèmes sensibles"],
      intermediaire: ["Appliquer la pseudonymisation sur les environnements de test et analytics", "Réaliser une revue trimestrielle des droits d'accès"],
      avance: ["Mettre en place une solution DLP (Data Loss Prevention)", "Déployer un SIEM pour la détection d'accès anormaux aux données personnelles"],
    },
  },
  {
    id: "sous_traitants", title: "4. Sous-traitants & Transferts", icon: "🌐",
    desc: "DPA, transferts hors UE, clauses contractuelles types",
    questions: [
      { id: "st_cartographie", text: "Tous vos sous-traitants accédant à des données personnelles sont-ils identifiés ?", options: ["Oui, cartographie complète et à jour", "Partiellement identifiés", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "st_dpa", text: "Des DPA (Data Processing Agreements) sont-ils signés avec tous vos sous-traitants ?", options: ["Oui, DPA conforme RGPD avec tous les sous-traitants", "Partiellement (seulement les principaux)", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "st_transferts", text: "Des données sont-elles transférées vers des pays hors UE/EEE ?", options: ["Non ou transferts encadrés (CCT, décision d'adéquation)", "Oui mais sans encadrement juridique", "Ne sait pas", "N/A"], weights: [3, 0, 1, 0], max: 3 },
      { id: "st_audit", text: "Auditez-vous la conformité RGPD de vos principaux sous-traitants ?", options: ["Oui, audit annuel ou questionnaire de conformité", "Rarement", "Non", "N/A"], weights: [3, 1, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Cartographier tous les sous-traitants accédant à des données personnelles", "Signer des DPA conformes avec tous les sous-traitants (modèle CNIL)", "Identifier les transferts hors UE et les encadrer (CCT ou décision d'adéquation)"],
      intermediaire: ["Mettre en place un questionnaire de conformité RGPD pour les nouveaux sous-traitants", "Revoir annuellement les DPA existants"],
      avance: ["Auditer les sous-traitants critiques sur site", "Exiger des certifications ISO 27001 ou SOC 2 des sous-traitants stratégiques"],
    },
  },
  {
    id: "violations", title: "5. Violations & Documentation", icon: "🚨",
    desc: "PIA, procédure de notification, documentation de conformité",
    questions: [
      { id: "viol_procedure", text: "Une procédure de gestion des violations de données est-elle formalisée ?", options: ["Oui, procédure documentée avec délai de 72h CNIL", "Procédure informelle", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "viol_pia", text: "Des Analyses d'Impact (PIA/AIPD) ont-elles été réalisées pour les traitements à risque ?", options: ["Oui, PIA réalisés et documentés", "Certains traitements analysés", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "viol_documentation", text: "La documentation de conformité RGPD est-elle centralisée et accessible ?", options: ["Oui, dossier RGPD complet et à jour", "Documentation partielle", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
      { id: "viol_test", text: "La procédure de notification de violation a-t-elle été testée (exercice) ?", options: ["Oui, exercice réalisé dans l'année", "Non mais procédure rédigée", "Non", "N/A"], weights: [3, 1.5, 0, 0], max: 3 },
    ],
    preconisations: {
      debutant: ["Rédiger une procédure de gestion des violations (72h CNIL, notification personnes concernées)", "Réaliser un PIA pour les traitements à risque (RH, santé, scoring)", "Centraliser toute la documentation RGPD dans un dossier dédié"],
      intermediaire: ["Organiser un exercice de gestion de crise RGPD annuel", "Utiliser un outil de conformité RGPD (OneTrust, Axeptio, Didomi)"],
      avance: ["Intégrer la gestion des violations dans le SIEM", "Obtenir la certification ISO 27701 (extension RGPD de l'ISO 27001)"],
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════

type SectionDef = typeof CYBER_SECTIONS[number]

function computeResults(sections: SectionDef[], answers: Record<string, number>) {
  const sectionResults: any[] = []
  let totalScore = 0, totalMax = 0

  for (const sec of sections) {
    let score = 0, max = 0
    for (const q of sec.questions) {
      const a = answers[q.id]
      if (a !== undefined && a < q.options.length - 1) {
        score += q.weights[a]; max += q.max
      }
    }
    const pct = max > 0 ? Math.round((score / max) * 100) : 0
    const level = pct >= 70 ? 'avance' : pct >= 40 ? 'intermediaire' : 'debutant'
    totalScore += score; totalMax += max

    sectionResults.push({
      id: sec.id,
      title: sec.title,
      score_pct: pct,
      level,
      preconisations: (sec.preconisations as any)?.[level] ?? [],
    })
  }

  return {
    global_score: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    sections: sectionResults,
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PAGE
// ═══════════════════════════════════════════════════════════════

export default function DiagnosticDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)
  const [diag, setDiag] = useState<DiagnosticItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [currentSection, setCurrentSection] = useState(0)
  const [step, setStep] = useState<'quiz' | 'report'>('quiz')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [companyInfo, setCompanyInfo] = useState({ name: '', sector: '', employees: '', contact: '' })
  const reportRef = useRef<HTMLDivElement>(null)
  const [showActionPlan, setShowActionPlan] = useState(false)
  const [selectedRecs, setSelectedRecs] = useState<Record<string, boolean>>({})
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [planCreated, setPlanCreated] = useState(false)

  useEffect(() => {
    getDiagnostic(id).then(d => {
      setDiag(d)
      if (d.answers) setAnswers(d.answers as any)
      if (d.company_info) setCompanyInfo(ci => ({ ...ci, ...d.company_info }))
      if (d.status === 'termine' && d.results) setStep('report')
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) return <div className="p-6 flex items-center justify-center h-64 text-gray-400">Chargement…</div>
  if (error) return <div className="p-6"><div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-lg text-sm">{error}</div></div>
  if (!diag) return null

  const sections = diag.type === 'cyber' ? CYBER_SECTIONS : diag.type === 'rgpd' ? RGPD_SECTIONS : IA_SECTIONS
  const totalQ = sections.reduce((s, sec) => s + sec.questions.length, 0)
  const answeredQ = Object.keys(answers).length

  const setAnswer = (qId: string, idx: number) => setAnswers(p => ({ ...p, [qId]: idx }))

  const saveProgress = async () => {
    setSaving(true)
    try {
      await updateDiagnostic(id, { answers, company_info: companyInfo })
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const finalize = async () => {
    const results = computeResults(sections, answers)
    setSaving(true)
    try {
      const updated = await updateDiagnostic(id, {
        answers,
        company_info: companyInfo,
        results,
        status: 'termine',
      })
      setDiag(updated)
      setStep('report')
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const copyShareLink = () => {
    if (!diag) return
    navigator.clipboard.writeText(`${window.location.origin}/share/${diag.share_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const createActionPlan = async () => {
    setCreatingPlan(true)
    const due = new Date()
    due.setDate(due.getDate() + 30)
    const dueIso = due.toISOString()
    const tasks = []
    for (const section of diag.results!.sections) {
      for (const rec of section.preconisations) {
        const key = `${section.id}:${rec}`
        if (!selectedRecs[key]) continue
        tasks.push(createTask({
          title: rec,
          client_id: diag.client_id,
          type: 'relance',
          priority: section.score_pct < 50 ? 'haute' : 'normale',
          due_date: dueIso,
        }))
      }
    }
    await Promise.all(tasks)
    setCreatingPlan(false)
    setPlanCreated(true)
    setTimeout(() => { setShowActionPlan(false); setPlanCreated(false); setSelectedRecs({}) }, 2000)
  }

  const results = diag.results ?? computeResults(sections, answers)
  const TypeIcon = diag.type === 'cyber' ? Shield : diag.type === 'rgpd' ? Shield : Brain
  const typeColor = diag.type === 'cyber' ? 'text-red-600' : diag.type === 'rgpd' ? 'text-blue-600' : 'text-violet-600'

  // ─── RAPPORT ────────────────────────────────────────
  if (step === 'report') {
    const globalScore = results.global_score ?? 0
    const scoreColor = globalScore >= 70 ? 'text-green-600' : globalScore >= 40 ? 'text-amber-600' : 'text-red-600'
    const scoreBg = globalScore >= 70 ? 'from-green-50 to-emerald-50' : globalScore >= 40 ? 'from-amber-50 to-yellow-50' : 'from-red-50 to-rose-50'
    const scoreLabel = globalScore >= 70 ? 'Conforme' : globalScore >= 40 ? 'Amélioration nécessaire' : 'Critique'

    return (
      <div ref={reportRef} className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/diagnostics')} className="p-1.5 rounded-lg hover:bg-gray-100"><ArrowLeft size={18} /></button>
            <TypeIcon size={20} className={typeColor} />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{diag.title}</h1>
              <p className="text-xs text-gray-500">
                {diag.client_name} · Réf DIAG-{String(diag.id).padStart(4, '0')} · {diag.created_at ? new Date(diag.created_at).toLocaleDateString('fr-FR') : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {diag.status === 'termine' && diag.results?.sections && (
              <button
                onClick={() => setShowActionPlan(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <CheckCircle2 size={14} /> Plan d'action
              </button>
            )}
            <button onClick={copyShareLink} className="btn-secondary flex items-center gap-1.5 text-sm">
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? 'Copié !' : 'Partager'}
            </button>
            <a href={getDiagnosticPdfUrl(diag.id)} target="_blank" rel="noopener" className="btn-primary flex items-center gap-1.5 text-sm">
              <Download size={14} /> PDF
            </a>
          </div>
        </div>

        {/* Score global */}
        <div className={`bg-gradient-to-br ${scoreBg} rounded-2xl p-8 text-center mb-8 border`}>
          <p className="text-sm text-gray-500 mb-2">Score Global</p>
          <p className={`text-5xl font-bold ${scoreColor}`}>{globalScore}%</p>
          <p className={`text-sm font-semibold mt-2 ${scoreColor}`}>{scoreLabel}</p>
        </div>

        {/* Sections */}
        <div className="grid gap-4">
          {(results.sections ?? []).map((sec: any) => {
            const pct = sec.score_pct ?? 0
            const c = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
            const tc = pct >= 70 ? 'text-green-700 bg-green-100' : pct >= 40 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
            return (
              <div key={sec.id} className="card p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{sec.title}</h3>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${tc}`}>{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full mb-3">
                  <div className={`h-2 rounded-full transition-all ${c}`} style={{ width: `${pct}%` }} />
                </div>
                {sec.preconisations?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Préconisations</p>
                    <ul className="space-y-1">
                      {sec.preconisations.map((p: string, i: number) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-accessia-500 mt-0.5">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-between">
          <button onClick={() => setStep('quiz')} className="btn-secondary text-sm">
            Modifier les réponses
          </button>
          <div className="flex gap-2">
            {diag.status === 'termine' && diag.results?.sections && (
              <button
                onClick={() => setShowActionPlan(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <CheckCircle2 size={14} /> Creer plan d'action
              </button>
            )}
            <button onClick={copyShareLink} className="btn-secondary flex items-center gap-1.5 text-sm">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              Lien de partage
            </button>
            <a href={getDiagnosticPdfUrl(diag.id)} target="_blank" rel="noopener" className="btn-primary flex items-center gap-1.5 text-sm">
              <Download size={14} /> Telecharger le rapport
            </a>
          </div>
        </div>

        {/* Modal plan d'action */}
        {showActionPlan && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Plan d'action</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Selectionnez les preconisations a convertir en taches</p>
                </div>
                <button
                  onClick={() => { setShowActionPlan(false); setSelectedRecs({}) }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <AlertTriangle size={18} className="rotate-45" />
                </button>
              </div>

              {/* Modal body */}
              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                {planCreated ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <CheckCircle2 size={48} className="text-green-500" />
                    <p className="text-lg font-semibold text-gray-900">Taches creees avec succes !</p>
                    <p className="text-sm text-gray-500">Le plan d'action a ete ajoute a votre liste de taches.</p>
                  </div>
                ) : (
                  diag.results!.sections.map((section: any) => (
                    section.preconisations?.length > 0 && (
                      <div key={section.id}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="font-semibold text-gray-900 text-sm">{section.title}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            section.score_pct >= 70
                              ? 'text-green-700 bg-green-100'
                              : section.score_pct >= 40
                              ? 'text-amber-700 bg-amber-100'
                              : 'text-red-700 bg-red-100'
                          }`}>{section.score_pct}%</span>
                        </div>
                        <div className="space-y-2">
                          {section.preconisations.map((rec: string, i: number) => {
                            const key = `${section.id}:${rec}`
                            const checked = selectedRecs[key] ?? false
                            return (
                              <label
                                key={i}
                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                  checked
                                    ? 'border-accessia-500 bg-accessia-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => setSelectedRecs(prev => ({ ...prev, [key]: e.target.checked }))}
                                  className="mt-0.5 accent-accessia-500"
                                />
                                <span className="text-sm text-gray-700">{rec}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ))
                )}
              </div>

              {/* Modal footer */}
              {!planCreated && (
                <div className="p-6 border-t flex items-center justify-between">
                  <button
                    onClick={() => { setShowActionPlan(false); setSelectedRecs({}) }}
                    className="btn-secondary text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={createActionPlan}
                    disabled={creatingPlan || Object.values(selectedRecs).filter(Boolean).length === 0}
                    className="btn-primary text-sm disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {creatingPlan ? (
                      'Creation en cours...'
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        Creer {Object.values(selectedRecs).filter(Boolean).length} tache{Object.values(selectedRecs).filter(Boolean).length !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── QUESTIONNAIRE ─────────────────────────────────
  const sec = sections[currentSection]
  const secDone = sec.questions.every(q => answers[q.id] !== undefined)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/diagnostics')} className="p-1.5 rounded-lg hover:bg-gray-100"><ArrowLeft size={18} /></button>
          <TypeIcon size={20} className={typeColor} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{diag.title}</h1>
            <p className="text-xs text-gray-500">{diag.client_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveProgress} disabled={saving} className="btn-secondary text-sm">
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          {answeredQ === totalQ && (
            <button onClick={finalize} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Finalisation…' : 'Finaliser le diagnostic'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Section {currentSection + 1} / {sections.length}</span>
          <span>{answeredQ} / {totalQ} questions</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-accessia-500 to-violet-500 transition-all"
            style={{ width: `${(answeredQ / totalQ) * 100}%` }}
          />
        </div>
      </div>

      {/* Section pills */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {sections.map((s, i) => {
          const done = s.questions.every(q => answers[q.id] !== undefined)
          const active = i === currentSection
          return (
            <button key={s.id} onClick={() => setCurrentSection(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                active ? 'border-accessia-500 bg-accessia-50 text-accessia-700' :
                done ? 'border-green-300 bg-green-50 text-green-700' :
                'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              {s.icon} {i + 1}
            </button>
          )
        })}
      </div>

      {/* Current section */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{sec.icon} {sec.title}</h2>
        <p className="text-sm text-gray-500 mb-6">{sec.desc}</p>

        <div className="space-y-6">
          {sec.questions.map((q, qi) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-gray-800 mb-2">{qi + 1}. {q.text}</p>
              <div className="grid gap-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi
                  const isNA = oi === q.options.length - 1
                  return (
                    <button key={oi} onClick={() => setAnswer(q.id, oi)}
                      className={`text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                        selected
                          ? isNA
                            ? 'border-gray-400 bg-gray-100 text-gray-700 font-medium'
                            : 'border-accessia-500 bg-accessia-50 text-accessia-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 text-xs font-bold ${
                        selected ? (isNA ? 'bg-gray-400 text-white' : 'bg-accessia-500 text-white') : 'bg-gray-100 text-gray-400'
                      }`}>
                        {isNA ? '—' : String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentSection(Math.max(0, currentSection - 1))}
          disabled={currentSection === 0}
          className="btn-secondary flex items-center gap-1 text-sm disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Précédent
        </button>

        <span className="text-xs text-gray-400">
          {secDone ? '✓ Section complète' : `${sec.questions.filter(q => answers[q.id] !== undefined).length} / ${sec.questions.length} réponses`}
        </span>

        {currentSection < sections.length - 1 ? (
          <button
            onClick={() => setCurrentSection(currentSection + 1)}
            className="btn-primary flex items-center gap-1 text-sm"
          >
            Suivant <ChevronRight size={15} />
          </button>
        ) : (
          <button
            onClick={finalize}
            disabled={saving || answeredQ < totalQ * 0.5}
            className="btn-primary flex items-center gap-1 text-sm disabled:opacity-40"
          >
            {saving ? 'Finalisation…' : 'Voir le rapport →'}
          </button>
        )}
      </div>
    </div>
  )
}
