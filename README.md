# Totem — Gerador de Senha de Atendimento

Protótipo de um totem de atendimento (tipo banco/mercado) com múltiplas
requisições simultâneas, aplicando os três pilares de segurança
(Confidencialidade, Integridade, Disponibilidade — tríade CID).

## O que é

O usuário preenche um formulário de identificação (nome, CPF, telefone,
e-mail opcional) e recebe uma senha de atendimento. O painel ao lado
mostra, em tempo real, o "console do servidor" — cada decisão que o
backend toma para lidar com o pedido.

## Como executar

Não precisa instalar nada. Abra `src/index.html` diretamente no navegador
(duplo clique), ou sirva a pasta `src/` com qualquer servidor estático:

```bash
cd src
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

## Tecnologias

- HTML, CSS e JavaScript puro (sem frameworks, sem dependências externas)
- Toda a lógica de "servidor" roda em JavaScript no navegador, para ser um
  protótipo fácil de demonstrar sem precisar de Node.js, banco de dados
  ou infraestrutura real. Em produção, o código de `src/js/backend.js`
  rodaria de fato em um servidor (Node/Express, por exemplo), e o
  armazenamento (idempotência, sessões, contador de senha) estaria em um
  banco de dados ou cache real (PostgreSQL, Redis), não em variáveis de
  memória do navegador.

## Estrutura do projeto

```
totem-atendimento/
├── src/
│   ├── index.html        # estrutura das telas (formulário, totem, erro)
│   ├── css/
│   │   └── style.css     # identidade visual (tema escuro, estilo terminal)
│   └── js/
│       ├── backend.js    # simulação do servidor (segurança e disponibilidade)
│       └── frontend.js   # validação, máscaras, fluxo de telas
├── docs/
│   └── ARQUITETURA.md    # como cada requisito foi implementado
├── tests/
│   └── CHECKLIST_MANUAL.md  # roteiro de testes manuais antes da entrega
├── .gitignore
└── README.md
```

## Requisitos atendidos (resumo)

**Front-end**
- Limite de caracteres (`maxlength`) em todos os campos
- Campos obrigatórios (nome, CPF, telefone)
- Máscaras de entrada (CPF e telefone formatados durante a digitação)
- Tipagem de inputs (`type="email"`, `inputmode="numeric"`)
- Popup de confirmação antes de enviar os dados
- Timeout de inatividade (limpa o formulário após período parado)
- Desabilita o botão após o clique (evita duplo envio)
- Página de erro customizada (nunca expõe stack trace)
- Content-Security-Policy via meta tag
- Sanitização de saída antes de exibir dados do usuário na tela (mitiga XSS)

**Back-end**
- Rate limiting (`verificarLimite`) — no máx. 3 requisições a cada 3s
- Idempotência (`cacheDeRespostas`) — clique duplicado não gera senha duplicada
- Fila de processamento (`filaDeRequisicoes`) — processa um pedido por vez
- Circuit breaker (`registrarResultadoBD`) — para de insistir após falhas seguidas
- Persistência de estado — sobrevive à "queda de energia" simulada
- Autenticação por token de sessão (conceito de JWT), emitido ao iniciar o atendimento
- Sanitização de entrada (`sanitizarEntrada`) — representa o princípio dos
  Prepared Statements: o dado do usuário nunca é tratado como comando
- Confidencialidade — mensagens de erro para o usuário são sempre
  genéricas; o detalhe técnico só vai para o log interno do servidor

Detalhes de como cada item se conecta à tríade CID estão em
`docs/ARQUITETURA.md`.
