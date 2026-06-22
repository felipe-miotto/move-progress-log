# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/905d5174-1667-49dc-b1cc-1e7743b2741e

## Fork / Clone do projeto em outra conta GitHub

Use este passo a passo quando precisar acessar o código em outra conta GitHub ou em outro computador.

### Opção A — Adicionar a outra conta como colaborador (mesmo repo)

Use quando as duas contas devem trabalhar no MESMO código e manter sync com este projeto Lovable.

1. No GitHub, abra o repositório deste projeto.
2. Vá em **Settings → Collaborators and teams → Add people**.
3. Digite o usuário GitHub da outra conta e escolha a permissão:
   - **Read** — apenas visualizar/clonar
   - **Triage** — gerenciar issues/PRs
   - **Write** — push direto no repo (recomendado para co-dev)
   - **Maintain** — write + gerenciar settings não-destrutivos
   - **Admin** — controle total
4. A outra conta recebe um e-mail e precisa aceitar o convite em `https://github.com/<owner>/<repo>/invitations`.
5. No outro computador, autentique-se naquela conta (`gh auth login` ou SSH key) e clone:
   ```sh
   git clone https://github.com/<owner>/<repo>.git
   cd <repo>
   npm i
   cp .env.example .env   # preencha com as credenciais do backend
   npm run dev
   ```
6. Pushes feitos por qualquer colaborador sincronizam automaticamente de volta para o Lovable.

### Opção B — Fork independente (cópia separada)

Use quando a outra conta deve ter uma cópia INDEPENDENTE, sem afetar o repo original.

1. Na outra conta GitHub, abra o repositório original e clique em **Fork** (canto superior direito).
2. Escolha o owner (conta/organização de destino) e confirme.
3. No outro computador, clone o fork:
   ```sh
   git clone https://github.com/<nova-conta>/<repo>.git
   cd <repo>
   git remote add upstream https://github.com/<owner-original>/<repo>.git   # opcional: receber updates
   npm i
   cp .env.example .env
   npm run dev
   ```
4. Para puxar mudanças do projeto original depois:
   ```sh
   git fetch upstream
   git merge upstream/main
   ```
5. Para conectar esse fork a um NOVO projeto Lovable, crie um projeto novo em lovable.dev e conecte-o ao fork via Plus (+) → GitHub.

### Opção C — Remix via Lovable (recomendado quando o objetivo é um novo projeto Lovable)

1. No Lovable, clique no nome do projeto (topo esquerdo) → **Settings → Remix this project**.
2. O remix vira um projeto Lovable independente, com o mesmo código.
3. Conecte o remix ao GitHub da outra conta via Plus (+) → **GitHub → Connect project**.

### Importante: backend não é clonado

O Lovable Cloud (Supabase) **não** é duplicado por fork/clone/remix. As opções:

- **Compartilhar o backend atual** — copie as variáveis do `.env` deste projeto para o `.env` do clone. As duas instâncias passam a gravar nos mesmos dados.
- **Backend separado** — siga o `RESTORE_GUIDE.md` para provisionar um novo Supabase, rodar `database-migration-complete.sql`, recriar secrets e fazer deploy das edge functions. Depois atualize `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` no `.env`.

Nunca commite o `.env` real — apenas `.env.example`.

### Gerenciar permissões depois

- **Trocar role de colaborador**: Settings → Collaborators → ícone ao lado do nome → escolher novo nível.
- **Remover acesso**: mesma tela → **Remove**.
- **Proteger a branch `main`**: Settings → Branches → Add rule → exigir PR review antes do merge (recomendado quando há mais de um colaborador).
- **Auditar acessos**: Settings → Audit log (em organizações) ou Security log (contas pessoais).

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/905d5174-1667-49dc-b1cc-1e7743b2741e) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/905d5174-1667-49dc-b1cc-1e7743b2741e) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## CI-First Staging Gate (GitHub Actions)

This repo now includes a CI-first staging flow that does not depend on manual Lovable execution:

- `CI` workflow: lint + typecheck + tests + build + security audit
- `Staging Edge Gate` workflow:
  - triggers automatically after a successful `CI` run on `main`
  - deploys essential edge functions
  - runs edge auth smoke tests
  - uploads `edge-smoke-report` artifact

### Required GitHub secrets

Configure these in `Settings -> Secrets and variables -> Actions`:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required only for optional service_role smoke tests)

### Manual run (optional)

You can manually trigger `Staging Edge Gate` via `workflow_dispatch` and enable:

- `run_service_role_tests = true` to execute A3/B4/C4 service_role checks.
