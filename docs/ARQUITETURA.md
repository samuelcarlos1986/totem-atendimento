# Arquitetura e checklist de requisitos

Este documento mapeia cada requisito pedido pelo professor para o trecho
de código que o implementa, e explica a conexão com a tríade CID
(Confidencialidade, Integridade, Disponibilidade).

## 1. Front-end (`src/js/frontend.js`, `src/index.html`)

| Requisito | Onde | Função de segurança/UX |
|---|---|---|
| Limite de caracteres | `maxlength` nos inputs | Previne envio desnecessário de grandes volumes de dados |
| Campos obrigatórios | `required` + `validarFormulario()` | Garante estado consistente antes do processamento |
| Máscaras de entrada | `aplicarMascaraCpf`, `aplicarMascaraTelefone` | Padroniza e evita caracteres especiais indevidos |
| Tipagem de inputs | `type="email"`, `inputmode="numeric"` | Navegador valida formato antes do envio |
| Popup de confirmação | `abrirConfirmacao()` / modal | Evita clique acidental, confirma dados antes de gerar registro |
| Timeout de inatividade | `reiniciarTimerInatividade()` | Totem público: limpa dados sensíveis (CPF) se abandonado |
| Desabilitar botão após clique | `btnContinuar.disabled = true` | Evita duplo envio pela UI (a defesa real é a idempotência no back) |
| Página de erro customizada | tela `#tela-erro` | Nunca expõe stack trace; mensagem genérica e amigável |
| CSP | `<meta http-equiv="Content-Security-Policy">` | Restringe origem de scripts/estilos, mitigando XSS |
| Sanitização de saída | `escaparTexto()` no modal; `textContent` na saudação | Dados do usuário nunca são injetados como HTML cru |

## 2. Back-end (`src/js/backend.js`)

| Requisito | Função | Pilar CID |
|---|---|---|
| Rate limiting | `verificarLimite()` | Disponibilidade |
| Idempotência | `cacheDeRespostas` em `tratarRequisicao()` | Integridade |
| Fila de processamento | `enfileirarRequisicao()` / `processarFila()` | Disponibilidade |
| Circuit breaker | `registrarResultadoBD()` | Disponibilidade |
| Persistência de estado | `ultimaSenhaSalva` sobrevive à queda simulada | Disponibilidade |
| Autenticação (conceito JWT) | `emitirTokenSessao()` / `validarTokenSessao()` | Confidencialidade / Integridade |
| Sanitização de entrada | `sanitizarEntrada()` | Integridade (equivalente a Prepared Statements) |
| Erros nunca vazam detalhe interno | `log()` com dois níveis (público x `console.log` interno) | Confidencialidade |

## 3. Por que alguns itens do checklist genérico não se aplicam aqui

O checklist do professor lista recursos gerais de segurança em sistemas
que têm **login** ou **transações financeiras** — nem todos fazem sentido
num totem público de emissão de senha:

- **Máscara de senha**: não há campo de senha no totem (não há login).
- **Balanceamento de carga real**: fora do escopo de um protótipo em
  JavaScript no navegador; representado conceitualmente pela fila de
  processamento, que já demonstra o princípio de não sobrecarregar o
  "servidor" com picos de requisições.
- **SQL Injection com Prepared Statements literais**: não há banco SQL
  real neste protótipo (ver nota no topo de `backend.js`); o princípio é
  demonstrado por `sanitizarEntrada()`, que trata a entrada do usuário
  sempre como dado, nunca como comando.

## 4. Fluxo da aplicação

```
Tela 1 (Formulário)
   │  preenche nome/CPF/telefone/e-mail
   │  valida no front (UX) → sanitiza no back (segurança real)
   ▼
Modal de confirmação
   │  usuário confirma os dados
   ▼
Backend.enfileirarRequisicao()
   │  token de sessão → rate limit → circuit breaker → idempotência
   ▼
Tela 2 (Totem + Console do servidor)
   │  senha exibida + log de cada decisão do backend
   │  botões de simulação (flood, banco fora do ar, queda de energia)
   ▼
[cenário de falha grave na 1ª tentativa] → Tela de erro customizada
```
