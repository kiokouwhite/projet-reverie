---
description: Le bot Discord qui relie l'app à ton serveur.
---

# Le bot Rêverie

**Rêverie** est le bot Discord qui fait le lien entre l'application et ton serveur. Quand tu postes une annonce ou lances des sondages depuis l'app, c'est lui qui exécute l'action côté Discord.

## Ce qu'il fait

* 📢 **Poster les annonces** rédigées dans l'outil Annonce Discord.
* 🗓️ **Poster les sondages d'horaires** (avec les réactions prêtes) et les **programmer** chaque semaine.
* 📊 **Lire les réactions** des sondages pour remonter les résultats dans l'app.
* 🏷️ **Annoter les votants** avec leurs rôles (TO FG / TO Smash) pour l'auto-remplissage des tâches.
* 🔔 Envoyer un **`@everyone`** en fin de sondage (si l'option est cochée).
* 💾 Servir de **sauvegarde** pour tes modèles et préférences (backup).

## Comment l'app lui parle

L'app contacte le bot via son **URL** et s'authentifie avec un **mot secret partagé** (`APP_SECRET`). Ces deux valeurs se renseignent dans l'onglet **[⚙️ Configuration](../demarrage/configuration.md)**. Sans elles, les fonctions Discord ne marchent pas.

## Permissions Discord requises

Pour que tout fonctionne, le bot doit être présent sur ton serveur et avoir les bonnes permissions **dans les salons visés** :

| Fonction | Permission nécessaire |
| --- | --- |
| Poster annonces & sondages | Voir le salon + Envoyer des messages |
| Ajouter les réactions de vote | Ajouter des réactions |
| Notifier tout le monde | **Mentionner @everyone** |
| Auto-remplir TO Smash / TO FG | Voir les membres et leurs rôles |

{% hint style="warning" %}
Le `@everyone` ne **notifie** que si le bot a la permission « Mentionner @everyone » dans le salon. Sans elle, Discord affiche le texte sans envoyer de notification.
{% endhint %}

## Réglages des rôles TO

L'auto-remplissage **TO Smash / TO FG** (dans l'outil Horaires) repose sur deux identifiants de rôles Discord configurés côté bot (`TO_FG_ROLE_ID` et `TO_SMASH_ROLE_ID`). S'ils ne sont pas définis, les deux zones restent vides même quand des gens votent.

Pour récupérer l'ID d'un rôle : active le **Mode développeur** dans Discord (Paramètres → Avancés), puis clic droit sur le rôle → **Copier l'identifiant**.

## Hébergement

Le bot tourne **en continu (24/7)** sur un petit serveur, avec redémarrage automatique. La mise à jour, l'hébergement, l'URL et le secret sont gérés par la personne responsable de l'infra — demande-lui ces informations pour configurer l'app.

{% hint style="info" %}
Un changement de comportement du bot (nouvelle option, correctif) nécessite un **redéploiement** côté serveur avant d'être actif — ce n'est pas automatique comme le site web.
{% endhint %}
