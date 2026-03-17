# Airtable Custom MCP Connector

Serveur MCP remote pour Claude.ai exposant **toutes les opérations Airtable** incluant la gestion du schéma (create/update tables & fields).

## Outils exposés

### Lecture
| Outil | Description |
|-------|-------------|
| `list_bases` | Lister toutes les bases |
| `get_base_schema` | Schéma complet d'une base (tables + champs) |
| `list_records` | Lire les enregistrements d'une table |

### Schéma (write)
| Outil | Description |
|-------|-------------|
| `create_table` | Créer une nouvelle table |
| `update_table` | Renommer / modifier une table |
| `create_field` | Ajouter un champ à une table |
| `update_field` | Modifier un champ existant |

### Enregistrements (write)
| Outil | Description |
|-------|-------------|
| `create_records` | Créer des enregistrements |
| `update_records` | Modifier des enregistrements |
| `delete_records` | Supprimer des enregistrements |

## Setup

### 1. Prérequis

- Node.js 20+
- Un PAT Airtable avec les scopes :
  - `schema.bases:read`
  - `schema.bases:write`
  - `data.records:read`
  - `data.records:write`

### 2. Install & build

```bash
npm install
npm run build
```

### 3. Test local

```bash
cp .env.example .env
# Remplis AIRTABLE_API_KEY dans .env
node dist/index.js
```

Test rapide :
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer patXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 4. Deploy sur Vercel

```bash
npx vercel deploy --prod
```

Ajoute la variable d'environnement dans le dashboard Vercel :
```
AIRTABLE_API_KEY = patXXXXXXXXXXXXXX
```

### 5. Connecter à Claude.ai

1. Va dans **Settings > Connectors > Add custom connector**
2. Nom : `Airtable Custom`
3. URL : `https://ton-projet.vercel.app/mcp`
4. Clique **Add**

## Auth

Le token peut être fourni de deux façons (par ordre de priorité) :
1. Header HTTP : `Authorization: Bearer patXXXX`
2. Variable d'env `AIRTABLE_API_KEY` (token unique partagé)

Pour un usage personnel, la variable d'env sur Vercel suffit.
