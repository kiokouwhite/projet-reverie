---
description: Le kit d'outils tout-en-un pour organiser les tournois FGC de l'asso.
---

# Bienvenue sur Projet Rêverie

**Projet Rêverie** est une application web qui regroupe tous les outils dont l'équipe a besoin pour organiser un tournoi FGC : générer les visuels de Top 8, rédiger et programmer les annonces Discord, planifier les sondages d'horaires, créer les tournois sur start.gg… le tout au même endroit.

L'app tourne **directement dans le navigateur** — rien à installer.

👉 **Accès :** [kiokouwhite.github.io/projet-reverie](https://kiokouwhite.github.io/projet-reverie/)

## Les 6 outils

| Outil | À quoi ça sert |
| --- | --- |
| 🏆 **TOP8 Generator** | Génère les visuels de Top 8 (import automatique depuis start.gg ou saisie manuelle) |
| 📢 **Annonce Discord** | Rédige et programme les annonces de tournoi |
| 🗓️ **Horaires** | Planifie les sondages hebdo (disponibilités, tâches) via des sondages Discord |
| 🎮 **Tournoi start.gg** | Crée un tournoi start.gg en un clic depuis un modèle |
| ✨ **start.gg Deluxe** | Import avancé et clonage de tournois, options pro |
| ⚙️ **Configuration** | Clé API start.gg, connexion au bot Discord, réglages |

À l'intérieur du TOP8 Generator se cache aussi le **🎨 Layout Maker**, un éditeur complet pour créer tes propres modèles de cartes.

## 3 principes à retenir

1. **Tes données restent chez toi.** La clé API, les réglages et les modèles sont stockés dans **ton navigateur** (localStorage). Rien n'est envoyé sur un serveur, sauf quand tu postes volontairement sur Discord via le bot.
2. **start.gg est la source de vérité.** Le workflow de l'asso : on saisit les résultats sur start.gg d'abord, puis on importe dans l'app.
3. **Le bot Rêverie fait le lien avec Discord.** Poster des annonces, lancer des sondages et lire les résultats passe par le bot (voir [Le bot Rêverie](bot/bot-reverie.md)).

## Par où commencer ?

* Tu débutes ? → [Premiers pas](demarrage/premiers-pas.md)
* Tu veux importer un tournoi ? → configure d'abord ta [clé API start.gg](demarrage/configuration.md)
* Un souci ? → [Dépannage](aide/depannage.md)
