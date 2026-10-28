---
description: Rédige, prévisualise et programme les annonces de tournoi sur Discord.
---

# Annonce Discord

L'outil **Annonce Discord** t'aide à rédiger une belle annonce de tournoi (avec les horaires, le lieu, les événements) et à la **poster ou la programmer** sur un salon Discord via le bot Rêverie.

## 1. Importer le tournoi (optionnel)

* Colle le **lien start.gg** du tournoi et clique sur **🔍 Chercher**.
* Les **événements** du tournoi apparaissent et peuvent être intégrés à l'annonce.

## 2. Rédiger l'annonce

### Preset

Choisis un **preset** pour partir d'un modèle de texte prêt à l'emploi :

* Lorem Ipsum — Smash Strasbourg
* Lorem Ipsum — Stras'Fighter
* Magna Arena — Stras'Fighters

### Texte

* **Emoji du tournoi** — l'emoji affiché en tête (sélecteur d'emoji custom du serveur).
* **Lieu** — le lieu de l'événement (ex. Gallia).
* **Phrase de clôture** — le petit mot de fin (ex. « Venez écrire l'histoire ! »).

### Horaires

Ajoute des **lignes d'horaires** (bouton **+ Ajouter une ligne**) pour détailler le déroulé (accueil, début des poules, top 8…).

## 3. Prévisualiser

Un **aperçu** te montre le rendu du message tel qu'il apparaîtra sur Discord, mis à jour au fur et à mesure de ta saisie.

## 4. Poster ou programmer

Dans la section **Bot Discord** :

1. Choisis le **salon** (sélecteur serveur → salon ; bouton **🔄 Rafraîchir les salons** si la liste est vide).
2. **🤖 Poster maintenant** pour un envoi immédiat…
3. …ou utilise le bloc **🕐 Programmer l'envoi** pour planifier l'annonce à une date/heure précise.

{% hint style="warning" %}
Pour poster, le bot doit être configuré (URL + secret dans l'onglet [Configuration](../demarrage/configuration.md)) et disposer des permissions nécessaires dans le salon visé.
{% endhint %}

## Modifier la dernière annonce envoyée

Une coquille dans l'annonce déjà postée ? Corrige dans l'outil (descriptions, horaires, jeux…), puis dans la carte **✏️ Dernière annonce envoyée** clique **Mettre à jour avec le message actuel** : le message Discord existant est **modifié sur place** (texte, cartes de jeu et 2e message de clôture), sans nouveau post ni nouveau ping.

* La carte rappelle quelle annonce sera modifiée (titre, date, salon) et une confirmation est demandée.
* Le bot mémorise la dernière annonce postée depuis le site **ou** par un envoi programmé, donc ça marche aussi après un redémarrage ou depuis un autre ordinateur (🔄 pour recharger).
* Si le message a été supprimé sur Discord, l'outil le signale : reposte normalement.
* Annonce plus ancienne (ou postée avant cette fonction) : sur Discord, clic droit sur le message → **Copier le lien du message**, colle-le dans la carte et clique **Utiliser**. Le bot vérifie que le message est bien le sien, retrouve son message de clôture, et tu peux le mettre à jour pareil.

## Copier le texte

Un bouton permet aussi de **copier le message en texte brut**, si tu préfères le coller toi-même.

{% hint style="info" %}
**Annonce programmée :** elle apparaît automatiquement dans le **Planning de l'app mobile** avec une notification à l'heure d'envoi, et disparaît une fois postée (ou annulée ici). Les annonces programmées sont conservées par le bot même s'il redémarre.
{% endhint %}
