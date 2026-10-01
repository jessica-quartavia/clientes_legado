# Base Clientes Legado

Cruzamento **BASEQV × Anchor × Pharus** para identificar clientes legado. Toda escrita fica em arquivos locais (`exports/`, `data/`). Os três bancos são consultados em **somente leitura**.

## Setup

1. Copie `.env.example` para `.env` e preencha as URLs e service role keys dos três projetos.
2. Instale dependências:

```bash
npm install
npm install --prefix frontend
```

## Gerar a base

```bash
npm run build:legacy
npm run audit:legacy
```

Ou em sequência:

```bash
npm run build:all
```

Saídas:

- `exports/clientes_legado.csv` / `.json`
- `exports/diagnostico_matches.csv`
- `exports/unmatched_anchor_legacy.csv`
- `data/clientes-legado.json`, `data/summary.json`, `data/build-status.json`

## Dashboard

```bash
npm run dev
```

Abre o Vite em `http://localhost:5173` lendo os JSON em `data/` (sem acesso direto ao Supabase).
