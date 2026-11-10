# TATI SAFE
**Segurança e Gestão Inteligente — Gestão de Permissão de Trabalho**

Primeira estrutura do aplicativo, preparada para GitHub Pages e SPCK Editor.

## Arquivos
- `index.html`: estrutura das telas.
- `styles.css`: identidade visual responsiva.
- `app.js`: cadastro e histórico com armazenamento local.
- `manifest.json`: configuração de instalação como PWA.
- `sw.js`: cache inicial para uso offline.
- `assets/icon.svg`: ícone do aplicativo.

## Executar
1. Abra o repositório no SPCK Editor ou publique pelo GitHub Pages.
2. Abra `index.html` em um servidor local ou acesse a URL publicada.
3. Crie uma PT de teste e consulte o histórico.

## Armazenamento e segurança
Nesta versão inicial, os registros são guardados no armazenamento local do navegador (`localStorage`). Isso significa que ficam no dispositivo e no perfil do navegador usados para o cadastro. Não há sincronização entre aparelhos, autenticação, criptografia específica dos registros ou cópia automática em nuvem.

**Atenção:** antes de utilizar em operações reais, implementar controle de acesso, sincronização/backup seguro, trilha de auditoria e validações operacionais. A pressão arterial é dado pessoal sensível; coletar e tratar somente quando houver justificativa e controles adequados, com acesso restrito e política de retenção.

## Próximas etapas
1. Checklists específicos de PTA, escadas e andaimes.
2. Análise de risco e medidas de controle por tipo de trabalho.
3. Fluxo de aprovação e encerramento da PT.
4. Impressão/PDF e backup.
5. Autenticação e banco de dados sincronizado para equipe.

Versão inicial: 0.1.