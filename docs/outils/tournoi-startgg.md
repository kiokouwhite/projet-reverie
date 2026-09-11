---
description: Prépare le tournoi de la semaine sur start.gg à partir de la semaine précédente.
---

# Tournoi start.gg

L'outil **Tournoi start.gg** t'aide à monter rapidement le tournoi de la semaine sur start.gg, en repartant du tournoi de la semaine précédente comme référence (détection semaine A/B, événements, horaires…).

{% hint style="warning" %}
Il faut ta **clé API start.gg** ([Configuration](../demarrage/configuration.md)). Sans elle, un avertissement s'affiche en haut de l'outil.
{% endhint %}

## Le principe

L'outil ne crée pas le tournoi vide à ta place : sur start.gg, on **duplique** un tournoi existant (fonctionnalité native de start.gg), puis l'outil aide à le **configurer** en s'appuyant sur la semaine précédente.

## Étape ① — Semaine précédente (référence)

1. Colle l'URL du **tournoi de la semaine passée** dans le champ prévu.
2. Clique sur **Charger**.

Cette référence sert à détecter la **semaine A/B** et à afficher les réglages précédents comme modèle.

## Étape ② — Tournoi cible (déjà dupliqué)

1. Sur start.gg, va sur ton tournoi précédent → **Dupliquer**.
2. Colle l'URL du **nouveau tournoi (vide)** dans le champ cible.
3. Clique sur **Charger**.

L'outil affiche alors les infos du tournoi cible et te permet de le configurer à partir de la référence.

## Résultat

Une fois validé, l'outil applique la configuration sur le tournoi cible et te fournit le **lien** vers le tournoi prêt sur start.gg.

{% hint style="info" %}
Besoin de gérer physiquement la salle et les setups le jour J (plan, bracket, matchs) ? C'est le rôle de **[start.gg Deluxe](startgg-deluxe.md)**.
{% endhint %}
