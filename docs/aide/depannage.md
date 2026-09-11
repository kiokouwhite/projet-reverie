# Dépannage

Les problèmes les plus courants et comment les régler.

## Import start.gg

### « HTTP 400 » quand je clique sur Chercher

start.gg a **refusé la requête**. Dans la quasi-totalité des cas, c'est la **clé API** : invalide, expirée, révoquée, ou mal collée (un espace ou un retour à la ligne en trop suffit).

**Solution :** régénère une clé sur [start.gg → Developer Settings](https://start.gg/admin/profile/developer) et recolle-la dans la [Configuration](../demarrage/configuration.md), sans espace ni saut de ligne.

{% hint style="info" %}
Un mauvais **lien** de tournoi ne donne pas d'erreur 400, mais un message « Tournoi introuvable ». Vérifie alors que le tournoi est **publié** (pas en brouillon) et que le lien contient `/tournament/…`.
{% endhint %}

### « Failed to fetch »

Problème de **connexion internet** ou clé API. Vérifie ta connexion, puis ta clé.

## Ma clé API disparaît quand je recharge / rouvre le navigateur

Deux causes possibles, toutes deux corrigées côté app :

1. **Un autre champ de config effaçait la clé** — corrigé (les champs sont désormais synchronisés).
2. **Le gestionnaire de mots de passe du navigateur** remplissait automatiquement le champ avec une ancienne valeur enregistrée.

**Si ça arrive encore**, supprime le mot de passe enregistré pour le site :

* **Opera GX / Chrome / Edge :** ouvre les mots de passe enregistrés (`opera://settings/passwords`, `chrome://settings/passwords`…), cherche **`kiokouwhite.github.io`**, et **supprime** l'entrée. Si le navigateur repropose de l'enregistrer, clique **« Jamais »**.

Puis recharge (`Ctrl + F5`) et re-saisis ta clé une dernière fois.

## Top 8 : des images de personnages ou de jeux manquent

Cause : le serveur d'images de start.gg n'envoie pas toujours l'en-tête technique (CORS) nécessaire pour dessiner l'image sur le visuel exportable.

**Bonne nouvelle :** l'app **réessaie automatiquement** via un proxy. Tu n'as rien à faire. Si une image manque encore ponctuellement, régénère l'aperçu.

## Le bouton des Horaires (cube) s'affiche « éclaté »

Sur certains navigateurs (Opera GX sans accélération matérielle), le rendu 3D peut mal s'afficher. L'app **détecte** ce cas et bascule sur un **bouton 2D** propre — même fonction, aucun réglage à faire.

Astuce : vérifier que **l'accélération matérielle** est activée dans les réglages du navigateur améliore aussi le rendu 3D.

## Horaires : le @everyone ne notifie pas

Le message `@everyone` s'affiche mais personne n'est notifié ? Le **bot** n'a pas la permission **« Mentionner @everyone »** dans le salon. Corrige-le dans les réglages du **serveur Discord** (pas dans l'app).

## Horaires : TO Smash / TO FG ne se remplissent plus

L'auto-remplissage dépend de deux identifiants de rôles configurés **côté bot** (`TO_FG_ROLE_ID` / `TO_SMASH_ROLE_ID`). S'ils manquent (par exemple après une manip de déploiement), les zones restent vides.

**Solution :** la personne qui gère le bot doit s'assurer que ces deux IDs sont présents dans la configuration du bot (`.env`) puis le redémarrer. Voir [Le bot Rêverie](../bot/bot-reverie.md).

## Horaires : les résultats ne se chargent pas

Recharge les résultats avec le bouton dédié (l'app ré-interroge le bot). Vérifie aussi que le bot est bien configuré (URL + secret) et en ligne.

## Une mise à jour n'apparaît pas

Force le rechargement : **`Ctrl + F5`**. Laisse passer ~1 minute (le CDN de GitHub Pages met parfois un court instant à propager la nouvelle version).

## Discord : « Poster » ne fait rien

* Vérifie l'**URL du bot** et le **secret** dans la [Configuration](../demarrage/configuration.md).
* Assure-toi que le bot est **en ligne** et présent sur le serveur.
* Rafraîchis la liste des salons et choisis-en un.
