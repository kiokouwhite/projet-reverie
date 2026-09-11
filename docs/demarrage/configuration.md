# Configuration (clé API & bot)

L'onglet **⚙️ Configuration** centralise tes identifiants. Tu les remplis **une seule fois** — ils sont ensuite synchronisés sur tous les outils.

## 🏟️ Clé API start.gg

C'est ce qui permet à l'app d'importer les tournois, les joueurs et les personnages depuis start.gg, et de créer/modifier des tournois.

### Obtenir sa clé

1. Va sur [start.gg → Developer Settings](https://start.gg/admin/profile/developer)
2. Connecte-toi à ton compte start.gg
3. Crée un **nouveau token** (Personal Access Token)
4. Copie-le

### La coller dans l'app

1. Ouvre l'onglet **⚙️ Configuration**
2. Colle la clé dans le champ **Clé API** (section start.gg)
3. C'est enregistré automatiquement

{% hint style="danger" %}
**Ne partage jamais ta clé API.** Elle donne accès à ton compte start.gg. Si tu penses qu'elle a fuité, révoque-la sur start.gg et génère-en une nouvelle.
{% endhint %}

{% hint style="warning" %}
**La clé disparaît au rechargement ?** Ce bug (autofill du navigateur qui écrase la clé) a été corrigé. Si tu l'observes encore, supprime le mot de passe enregistré pour `kiokouwhite.github.io` dans le gestionnaire de mots de passe de ton navigateur. Détails dans le [Dépannage](../aide/depannage.md).
{% endhint %}

## 🤖 Bot Discord

Pour poster des annonces, lancer des sondages d'horaires et lire les résultats, l'app parle au **bot Rêverie**. Il faut lui donner deux infos :

| Champ | C'est quoi |
| --- | --- |
| **URL du bot** | L'adresse où tourne le bot (son point d'accès HTTPS). |
| **Mot secret (APP_SECRET)** | Le mot de passe partagé qui authentifie l'app auprès du bot. |

Ces valeurs te sont fournies par la personne qui gère l'hébergement du bot (voir [Le bot Rêverie](../bot/bot-reverie.md)). Sans elles, les outils Discord (Annonce, Horaires) ne pourront pas poster.

## 🔔 Salon de log Rêverie (optionnel)

Tu peux indiquer un salon Discord où le bot enverra ses messages de log/suivi. Le sélecteur te laisse choisir le serveur puis le salon.

## 👁️ Afficher les mots de passe

Les champs sensibles (clé API, secret) sont masqués par des points. Le bouton **« Afficher les mots de passe »** te permet de vérifier ce que tu as collé.

## Bon à savoir

* **Une seule saisie.** Les identifiants remplis ici sont automatiquement repris par les autres onglets (Top 8, Annonce, Horaires…).
* **Stockage local.** Tout reste dans ton navigateur.
* **La clé API n'est pas sauvegardée en ligne**, même quand tu utilises la sauvegarde sur le bot — c'est volontaire, pour la sécurité.
