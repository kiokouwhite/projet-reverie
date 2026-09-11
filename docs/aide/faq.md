# FAQ

**Est-ce que je dois installer quelque chose ?**
Non. Projet Rêverie est un site web : [kiokouwhite.github.io/projet-reverie](https://kiokouwhite.github.io/projet-reverie/). Il s'ouvre dans le navigateur.

**Où sont stockées mes données ?**
Dans **ton navigateur**, sur ton ordinateur (localStorage). Elles survivent au redémarrage mais sont liées à ce navigateur/PC. Rien n'est envoyé en ligne, sauf quand tu postes sur Discord ou que tu utilises la sauvegarde sur le bot.

**Ma clé API start.gg est-elle en sécurité ?**
Oui : elle ne quitte jamais ton navigateur et n'est **jamais** sauvegardée en ligne, même via la sauvegarde sur le bot. Ne la partage jamais ; en cas de doute, révoque-la sur start.gg et régénères-en une.

**Comment obtenir une clé API start.gg ?**
start.gg → [Developer Settings](https://start.gg/admin/profile/developer) → créer un nouveau token → le coller dans la [Configuration](../demarrage/configuration.md).

**Je change d'ordinateur, comment retrouver mes réglages ?**
Utilise la **sauvegarde sur le bot** (onglet Configuration) pour pousser tes modèles et préférences, puis restaure-les sur l'autre PC. La clé API, elle, est à re-saisir (non sauvegardée par sécurité).

**Quelle taille font les visuels de Top 8 ?**
**1400 × 1400 px**.

**Puis-je créer mes propres modèles de cartes ?**
Oui, avec le **[Layout Maker](../outils/layout-maker.md)** (8 étapes), accessible depuis le TOP8 Generator.

**Le bot ne poste rien, pourquoi ?**
Vérifie l'URL + le secret du bot dans la Configuration, que le bot est en ligne, et qu'il a les permissions dans le salon. Voir [Le bot Rêverie](../bot/bot-reverie.md).

**Le `@everyone` n'envoie pas de notification.**
Le bot n'a pas la permission « Mentionner @everyone » dans le salon (réglage Discord côté serveur).

**Une nouveauté n'apparaît pas.**
Recharge avec `Ctrl + F5` et patiente ~1 min (propagation GitHub Pages). Les changements du **bot**, eux, nécessitent un redéploiement côté serveur.

**Quel navigateur utiliser ?**
N'importe quel navigateur moderne. Pour les animations 3D, active l'accélération matérielle ; sinon l'app bascule automatiquement sur des versions simplifiées.
