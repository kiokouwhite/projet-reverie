---
description: Génère les visuels de Top 8 (1400×1400) à partir de start.gg ou à la main.
---

# TOP8 Generator

Le **TOP8 Generator** transforme les résultats d'un tournoi en un beau visuel carré (1400×1400 px) prêt à publier sur les réseaux et Discord.

## Le workflow en bref

1. **Importer** les résultats (start.gg) ou les saisir à la main
2. Choisir le **jeu** et vérifier le **nom du tournoi**
3. Charger une **image de fond**
4. Assigner un **personnage** à chaque joueur
5. Choisir un **layout** (modèle de carte)
6. **Générer l'aperçu** puis **télécharger** l'image

## 1. Importer depuis start.gg

1. Assure-toi d'avoir renseigné ta [clé API start.gg](../demarrage/configuration.md).
2. Colle le **lien du tournoi** start.gg dans le champ prévu.
3. Clique sur **🔍 Chercher**.
4. Si le tournoi a plusieurs jeux, un menu te laisse **cocher les jeux à importer**. Si un même jeu a **plusieurs events** (ex. « MAIN EVENT » + « Liste d'attente »), chaque event a sa propre ligne et **seul le plus gros est coché** par défaut : coche l'autre si tu veux aussi son Top 8.
5. Les noms des joueurs (et souvent leurs personnages) se remplissent automatiquement.

{% hint style="info" %}
**Workflow de l'asso :** on saisit d'abord les scores sur start.gg, puis on importe ici. start.gg reste la source de vérité.
{% endhint %}

### Saisie manuelle

Pas de tournoi start.gg ? Tu peux aussi taper les pseudos directement dans les cases joueurs et tout régler à la main.

## 2. Jeu & infos du tournoi

* Sélectionne le **jeu** (il conditionne le roster de personnages et le thème).
* Vérifie le **nom** et le **numéro** du tournoi (pré-remplis depuis start.gg, modifiables).

## 3. Image de fond

* Clique sur la zone d'import pour charger ton **fond**.
* Tu peux le changer à chaque tournoi sans rien reconfigurer d'autre.

## 4. Joueurs & personnages

* Vérifie et corrige les **noms** importés si besoin.
* Pour chaque joueur, clique sur **« Choisir »** pour lui assigner un **personnage**.
  * Les personnages du **roster local** ont des artworks intégrés.
  * Pour les persos non mappés, l'app récupère l'image depuis start.gg.

{% hint style="info" %}
Certaines images de personnages ou de jeux viennent de start.gg. Si l'une manque, l'app réessaie automatiquement via un proxy — pas d'action nécessaire de ta part.
{% endhint %}

## 5. Choisir un layout

Un **layout** = le modèle graphique des cartes (forme, police, position des noms/rangs…). Choisis-en un existant, ou crée le tien avec le **[Layout Maker](layout-maker.md)**.

## 6. Aperçu, message & export

* **Générer l'aperçu** pour voir le rendu final.
* Ajuste le **message X/Twitter** proposé si tu veux l'accompagner d'un texte.
* **Télécharger l'image** : elle s'exporte en **1400×1400 px**.
* Des boutons permettent aussi de poster directement (X, Instagram) selon la configuration.

## Recadrer une image

Quand tu ajustes le cadrage d'une image de personnage (surtout sur les layouts custom), une **indication en pointillé** montre ce qui sera réellement visible dans la carte.

## Problèmes fréquents

| Symptôme | Piste |
| --- | --- |
| **HTTP 400** au « Chercher » | Clé API invalide/expirée/mal collée → régénère-la. Voir [Dépannage](../aide/depannage.md). |
| **Noms non importés** | Vérifie que le lien contient bien `/tournament/…`. |
| **Image de perso manquante** | Souvent un souci CORS côté start.gg ; l'app tente un proxy automatiquement. |

➡️ Voir le [Dépannage](../aide/depannage.md) pour le détail.
