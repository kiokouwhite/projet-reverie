---
description: Lance les sondages de disponibilités sur Discord et répartis les tâches.
---

# Horaires

L'outil **Horaires** sert à sonder l'équipe chaque semaine : à quelle heure les gens arrivent/partent, quelles tâches ils veulent prendre… Il **poste des sondages sur Discord**, **lit les réactions** et t'aide à **répartir les tâches** (accueil, seeding, régie, TO…).

## Vue d'ensemble

L'outil a deux faces, entre lesquelles on bascule avec le bouton en bas à droite :

* **Questions du sondage** — préparer et poster les sondages.
* **Résultats** — lire les votes et assigner les tâches.

{% hint style="info" %}
Le bouton de bascule Questions ↔ Résultats est un petit **bouton animé** en bas à droite. Sur les navigateurs qui gèrent mal la 3D, il s'affiche en version 2D simplifiée — même fonction.
{% endhint %}

## Choisir le type de sondage

Dans le panneau de gauche, la carte **« Type de sondage »** (3ᵉ onglet) permet de choisir le modèle à envoyer :

| Type | Contenu | Planning associé |
| --- | --- | --- |
| 📋 **Lorem Ipsum** | Le sondage complet : heure d'arrivée, heure de départ, tâche souhaitée. | Installation, Rangement, Accueil, Régie, Seeding, TO Smash / TO FG |
| ⚔️ **Magna Arena** | Version **simplifiée** : une seule question « Sur quoi peux-tu aider ? » avec 3 options — **Installation**, **Rangement**, **TO**. | Installation, Rangement, TO |

* Chaque type garde **ses propres questions** (tu peux les éditer indépendamment).
* En **Magna Arena**, le **TO** se remplit directement à partir des **votes** du sondage (et non des rôles Discord).
* Le type sélectionné est mémorisé et s'applique à l'envoi immédiat comme à l'envoi hebdomadaire.

## 1. Préparer les questions

Prépare tes questions et leurs options (chaque option a un **emoji** — c'est via cet emoji que les gens votent en réagissant). Les flèches **▲ ▼** à côté de chaque option (et de chaque question) permettent de **changer l'ordre** ; en Magna Arena, les 3 premières options correspondent, dans l'ordre, à Installation, Rangement et TO. Exemples typiques :

* « À quelle heure arrivez-vous ? » → 16h, 17h, 18h…
* « À quelle heure partez-vous ? » → avant/pendant le rangement, à la fermeture…
* « Voulez-vous une tâche en priorité ? » → Seeding, Accueil, Régie…

## 2. Poster les sondages

1. Choisis le **salon** Discord.
2. (Optionnel) coche **📣 Mentionner @everyone en postant**.
3. Clique sur **📨 Poster les sondages maintenant**.

Le bot poste chaque question comme un message avec les **réactions** déjà prêtes, pour que les gens votent en un clic.

### L'option @everyone

Quand la case est cochée, le bot envoie un **message `@everyone` séparé, tout à la fin**, après tous les sondages (comme un ping manuel). Ça notifie tout le monde sans polluer les sondages.

{% hint style="warning" %}
Pour que le `@everyone` **notifie** réellement, le bot doit avoir la permission **« Mentionner @everyone »** dans le salon (réglage Discord, côté serveur — pas dans l'app).
{% endhint %}

## 3. Programmer chaque semaine

Tu peux aussi **programmer** les sondages pour qu'ils partent automatiquement chaque semaine (planification hebdo gérée par le bot), sans avoir à revenir cliquer.

## 4. Lire les résultats

Passe sur la face **Résultats** : l'outil récupère les **réactions** de chaque sondage et affiche, pour chaque option, qui a voté.

{% hint style="info" %}
Si les résultats ne se chargent pas, recharge-les avec le bouton de rechargement (l'outil re-interroge le bot).
{% endhint %}

## 5. Répartir les tâches

À partir des votes, tu répartis les gens dans les rôles. Certaines zones se **remplissent automatiquement** :

| Rôle | Remplissage |
| --- | --- |
| 🌱 **Seeding** | Depuis les votes de la question dédiée |
| 🧑‍🍳 **Accueil**, 🎛️ **Régie** | Depuis les votes |
| 💥 **TO Smash** / 🎮 **TO FG** | **Automatique** : depuis les rôles Discord des votants |

Tu peux ensuite **glisser-déposer** les personnes entre les zones pour ajuster.

### L'auto-remplissage TO Smash / TO FG

Le bot regarde, pour chaque votant, s'il possède le rôle Discord **TO FG** ou **TO Smash** sur le serveur, et pré-remplit les zones en conséquence.

{% hint style="warning" %}
Cet auto-remplissage dépend de deux réglages côté bot (`TO_FG_ROLE_ID` / `TO_SMASH_ROLE_ID`). S'ils manquent, les zones restent vides. Voir [Le bot Rêverie](../bot/bot-reverie.md) et le [Dépannage](../aide/depannage.md).
{% endhint %}
