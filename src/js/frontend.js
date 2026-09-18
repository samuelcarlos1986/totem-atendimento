/*
============================================================================
FRONTEND.JS — camada de interface (totem)
============================================================================
Responsabilidade única: coletar e validar o que o usuário digita, e
mostrar o que o servidor (backend.js) responde. Nenhuma decisão de
segurança "de verdade" (limite, idempotência, sanitização) é tomada
aqui — isso fica no backend. O front só faz a primeira camada de
validação, por usabilidade (feedback imediato), nunca como única defesa.
============================================================================
*/

// ---------- Referências de elementos ----------
const telas = {
  formulario: document.getElementById('tela-formulario'),
  totem: document.getElementById('tela-totem'),
  erro: document.getElementById('tela-erro'),
};

const form = document.getElementById('form-identificacao');
const inputNome = document.getElementById('input-nome');
const inputCpf = document.getElementById('input-cpf');
const inputTelefone = document.getElementById('input-telefone');
const inputEmail = document.getElementById('input-email');
const btnContinuar = document.getElementById('btn-continuar');

const modal = document.getElementById('modal-confirmacao');
const modalResumo = document.getElementById('modal-resumo');
const btnConfirmar = document.getElementById('btn-confirmar');
const btnCancelarConfirmacao = document.getElementById('btn-cancelar-confirmacao');

const ticketNumber = document.getElementById('ticket-number');
const ticketStatus = document.getElementById('ticket-status');
const saudacaoUsuario = document.getElementById('saudacao-usuario');
const btnNovaSenha = document.getElementById('btn-nova-senha');

const logEl = document.getElementById('log-entries');
const timeoutAviso = document.getElementById('timeout-aviso');
const timeoutSegundos = document.getElementById('timeout-segundos');

// ---------- Troca de telas ----------
function mostrarTela(nome) {
  Object.values(telas).forEach(t => t.classList.remove('tela-ativa'));
  telas[nome].classList.add('tela-ativa');
}

// ---------- Sessão (REQUISITO: token emitido ao iniciar o atendimento) ----------
let tokenSessaoAtual = null;

function iniciarSessao() {
  tokenSessaoAtual = Backend.emitirTokenSessao();
  document.getElementById('state-token').textContent = tokenSessaoAtual.slice(0, 18) + '…';
}

// ============================================================
// REQUISITO (Máscaras de Entrada): CPF e telefone
// ============================================================
function aplicarMascaraCpf(valor) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function aplicarMascaraTelefone(valor) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 10) {
    return digitos
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return digitos
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

inputCpf.addEventListener('input', () => {
  inputCpf.value = aplicarMascaraCpf(inputCpf.value);
});
inputTelefone.addEventListener('input', () => {
  inputTelefone.value = aplicarMascaraTelefone(inputTelefone.value);
});

// ============================================================
// REQUISITO (Campos Obrigatórios / Tipagem de Inputs): validação
// Primeira camada, por usabilidade — a validação que importa de
// verdade acontece no backend (sanitizarEntrada / tratarRequisicao).
// ============================================================
function mostrarErroCampo(input, elErro, mensagem) {
  input.classList.toggle('invalido', Boolean(mensagem));
  elErro.textContent = mensagem || '';
}

function validarFormulario() {
  let valido = true;

  const nome = inputNome.value.trim();
  if (nome.length < 3) {
    mostrarErroCampo(inputNome, document.getElementById('erro-nome'), 'Informe seu nome completo.');
    valido = false;
  } else {
    mostrarErroCampo(inputNome, document.getElementById('erro-nome'), '');
  }

  const cpfDigitos = inputCpf.value.replace(/\D/g, '');
  if (cpfDigitos.length !== 11) {
    mostrarErroCampo(inputCpf, document.getElementById('erro-cpf'), 'CPF deve ter 11 dígitos.');
    valido = false;
  } else {
    mostrarErroCampo(inputCpf, document.getElementById('erro-cpf'), '');
  }

  const telDigitos = inputTelefone.value.replace(/\D/g, '');
  if (telDigitos.length < 10) {
    mostrarErroCampo(inputTelefone, document.getElementById('erro-telefone'), 'Informe um telefone válido com DDD.');
    valido = false;
  } else {
    mostrarErroCampo(inputTelefone, document.getElementById('erro-telefone'), '');
  }

  // Tipagem de input: type="email" já ajuda o navegador a validar o
  // formato antes do clique em enviar. Campo é opcional, mas se
  // preenchido precisa ser válido.
  if (inputEmail.value && !inputEmail.checkValidity()) {
    mostrarErroCampo(inputEmail, document.getElementById('erro-email'), 'E-mail em formato inválido.');
    valido = false;
  } else {
    mostrarErroCampo(inputEmail, document.getElementById('erro-email'), '');
  }

  return valido;
}

// ============================================================
// REQUISITO (Popup de Confirmação)
// ============================================================
function escaparTexto(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function abrirConfirmacao() {
  modalResumo.innerHTML = `
    Nome: <b>${escaparTexto(inputNome.value.trim())}</b><br>
    CPF: <b>${escaparTexto(inputCpf.value)}</b><br>
    Telefone: <b>${escaparTexto(inputTelefone.value)}</b><br>
    ${inputEmail.value ? `E-mail: <b>${escaparTexto(inputEmail.value)}</b><br>` : ''}
  `;
  modal.hidden = false;
}

function fecharConfirmacao() {
  modal.hidden = true;
}

// ============================================================
// REQUISITO (Timeout de Inatividade)
// Totem público: se ninguém interagir por um tempo, os dados
// digitados são limpos por privacidade (evita expor CPF de um
// usuário anterior para o próximo).
// ============================================================
const LIMITE_INATIVIDADE_MS = 25000;
const AVISO_ANTES_MS = 10000;
let timerInatividade = null;
let timerAvisoCountdown = null;

function reiniciarTimerInatividade() {
  clearTimeout(timerInatividade);
  clearInterval(timerAvisoCountdown);
  timeoutAviso.hidden = true;

  timerInatividade = setTimeout(() => {
    let restante = Math.floor(AVISO_ANTES_MS / 1000);
    timeoutAviso.hidden = false;
    timeoutSegundos.textContent = restante;

    timerAvisoCountdown = setInterval(() => {
      restante -= 1;
      timeoutSegundos.textContent = restante;
      if (restante <= 0) {
        clearInterval(timerAvisoCountdown);
        form.reset();
        ['nome', 'cpf', 'telefone', 'email'].forEach(campo => {
          mostrarErroCampo(document.getElementById(`input-${campo}`), document.getElementById(`erro-${campo}`), '');
        });
        timeoutAviso.hidden = true;
      }
    }, 1000);
  }, LIMITE_INATIVIDADE_MS - AVISO_ANTES_MS);
}

form.addEventListener('input', reiniciarTimerInatividade);
reiniciarTimerInatividade();

// ============================================================
// Envio — integra front (formulário) com back (fila/servidor)
// ============================================================
function gerarChaveIdempotencia() {
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function solicitarSenha(dados) {
  const chave = gerarChaveIdempotencia();
  Backend.log(`totem enviou requisição de senha (sessão ${tokenSessaoAtual.slice(0, 10)}…)`, 'ok', 'REQ');

  Backend.enfileirarRequisicao(
    { token: tokenSessaoAtual, dados, chaveIdempotencia: chave },
    (resultado) => {
      Backend.log(resultado.msg, resultado.tipo, String(resultado.codigo),
        resultado.codigo >= 400 ? `detalhe técnico omitido do usuário (código ${resultado.codigo})` : null);

      if (resultado.codigo === 200) {
        mostrarTicket(resultado);
      } else if (resultado.codigo >= 500 && telas.formulario.classList.contains('tela-ativa')) {
        // Falha grave logo na primeira tentativa: mostra tela de erro
        // customizada em vez de deixar o usuário preso no formulário.
        mostrarErroCustomizado(resultado.codigo, resultado.msg);
      } else if (telas.totem.classList.contains('tela-ativa')) {
        ticketStatus.textContent = `${resultado.codigo}: ${resultado.msg}`;
      }

      btnContinuar.disabled = false;
    }
  );
}

function mostrarTicket(resultado) {
  ticketNumber.textContent = String(resultado.senha).padStart(3, '0');
  ticketStatus.textContent = 'senha emitida com sucesso';
  saudacaoUsuario.textContent = resultado.nomeSeguro
    ? `Bem-vindo(a), ${resultado.nomeSeguro}`
    : 'Toque para retirar outra senha';
  mostrarTela('totem');
}

function mostrarErroCustomizado(codigo, msgInterna) {
  document.getElementById('erro-codigo').textContent = String(codigo);
  document.getElementById('erro-titulo').textContent =
    codigo === 503 ? 'Serviço temporariamente indisponível' : 'Não foi possível concluir sua solicitação';
  mostrarTela('erro');
}

// ---------- Envio do formulário ----------
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!validarFormulario()) return;
  abrirConfirmacao();
});

btnCancelarConfirmacao.addEventListener('click', fecharConfirmacao);

btnConfirmar.addEventListener('click', () => {
  fecharConfirmacao();
  btnContinuar.disabled = true;

  const dados = {
    nome: inputNome.value.trim(),
    cpf: inputCpf.value,
    telefone: inputTelefone.value,
    email: inputEmail.value.trim(),
  };
  solicitarSenha(dados);
});

btnNovaSenha.addEventListener('click', () => {
  form.reset();
  mostrarTela('formulario');
  reiniciarTimerInatividade();
});

document.getElementById('btn-voltar-erro').addEventListener('click', () => {
  mostrarTela('formulario');
  reiniciarTimerInatividade();
});

// ---------- Botões de simulação (demonstração para o professor) ----------
document.getElementById('btn-flood').addEventListener('click', () => {
  Backend.log('--- simulando 20 cliques sucessivos do cliente ---', 'warn', 'SIM');
  for (let i = 0; i < 20; i++) {
    setTimeout(() => solicitarSenha({ nome: inputNome.value.trim() || 'Visitante' }), i * 60);
  }
});

document.getElementById('btn-falha-bd').addEventListener('click', () => {
  Backend.alternarFalhaBD();
});

document.getElementById('btn-queda').addEventListener('click', () => {
  Backend.simularQuedaDeEnergia();
});

// ---------- Log do servidor (renderização) ----------
Backend.onLog(({ msg, level, codigo }) => {
  const now = new Date().toLocaleTimeString('pt-BR');
  const div = document.createElement('div');
  div.className = 'log-entry ' + level;
  const spanTime = document.createElement('span');
  spanTime.className = 'log-time';
  spanTime.textContent = now;
  const spanCode = document.createElement('span');
  spanCode.className = 'log-code ' + level;
  spanCode.textContent = codigo;
  div.appendChild(spanTime);
  div.appendChild(spanCode);
  div.appendChild(document.createTextNode(msg));
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
});

// ---------- Estado do servidor (renderização) ----------
Backend.onEstado(({ servidorNoAr, circuitoAberto, ultimaSenhaSalva }) => {
  document.getElementById('state-servidor').innerHTML =
    servidorNoAr ? '<span class="pill up">no ar</span>' : '<span class="pill down">fora do ar</span>';
  document.getElementById('state-circuito').innerHTML =
    circuitoAberto ? '<span class="pill down">aberto (bloqueando)</span>' : '<span class="pill up">fechado</span>';
  document.getElementById('state-ultima').textContent = ultimaSenhaSalva;
});

// ---------- Inicialização ----------
iniciarSessao();
Backend.log('servidor iniciado — contador recuperado do armazenamento persistente', 'ok', 'BOOT');
Backend.emitirEstado();
mostrarTela('formulario');
