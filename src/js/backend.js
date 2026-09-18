/*
============================================================================
BACKEND.JS — simulação de servidor
============================================================================
Tudo neste arquivo representa o que, num sistema real, rodaria no SERVIDOR
(Node/Express, Python/Flask etc.), não no navegador do cliente. Está em
JavaScript no navegador para ser fácil de rodar e demonstrar, sem precisar
instalar nada. Em produção, o armazenamento (idempotência, contador,
sessões) estaria em banco de dados/cache real (Redis, PostgreSQL), não em
variáveis de memória do navegador.

Cada função está marcada com o REQUISITO do checklist a que corresponde.
============================================================================
*/

const Backend = (() => {

  // ---- "banco de dados" simulado ----
  let ultimaSenhaSalva = 0;
  let servidorNoAr = true;
  let bancoDeDadosDisponivel = true;
  let circuitoAberto = false;
  let falhasSeguidasBD = 0;
  const LIMITE_FALHAS_CIRCUITO = 3;

  // ---- idempotência (REQUISITO: duplo clique não gera 2 senhas) ----
  const cacheDeRespostas = new Map();

  // ---- rate limiting (REQUISITO: evita muitas requisições sucessivas) ----
  const JANELA_MS = 3000;
  const LIMITE_NA_JANELA = 3;
  let historicoDeRequisicoes = [];

  // ---- fila de processamento (REQUISITO: disponibilidade sob carga) ----
  const filaDeRequisicoes = [];
  let processandoFila = false;

  // ---- sessões autenticadas (REQUISITO: Autenticação — conceito de JWT) ----
  // Cada "sessão de atendimento" recebe um token ao ser criada. Isso
  // representa o mesmo papel que um JWT tem num sistema real: provar,
  // nas próximas chamadas, "quem está fazendo esta requisição" sem
  // precisar reenviar os dados completos do usuário a cada passo.
  const sessoesAtivas = new Map(); // token -> { criadoEm }

  const listeners = { log: [], estado: [] };

  function onLog(fn) { listeners.log.push(fn); }
  function onEstado(fn) { listeners.estado.push(fn); }

  // Dois níveis de log — REQUISITO (Confidencialidade): o painel do
  // usuário nunca recebe detalhes internos (nomes de tabela, stack
  // trace, etc.); isso vai só para o console real do navegador
  // (equivalente ao log interno do desenvolvedor no servidor).
  function log(msgPublica, level = 'ok', codigo = '200', detalheInterno = null) {
    if (detalheInterno) {
      console.log(`[server-interno] ${codigo} — ${detalheInterno}`);
    }
    listeners.log.forEach(fn => fn({ msg: msgPublica, level, codigo }));
  }

  function emitirEstado() {
    const estado = {
      servidorNoAr, circuitoAberto, ultimaSenhaSalva,
      sessoesAtivas: sessoesAtivas.size,
    };
    listeners.estado.forEach(fn => fn(estado));
  }

  // ============================================================
  // REQUISITO (Prevenção de Injeção / Integridade): sanitização de
  // entrada. Não existe banco SQL real aqui, mas esta função representa
  // o mesmo princípio dos Prepared Statements — o dado do usuário é
  // SEMPRE tratado como texto puro, nunca interpretado ou concatenado
  // como parte de um comando. Caracteres de controle e tags são
  // removidos antes de qualquer uso (armazenamento, log ou exibição).
  // ============================================================
  function sanitizarEntrada(valor) {
    if (typeof valor !== 'string') return '';
    return valor
      .replace(/[<>]/g, '')       // remove indícios de tags/HTML (mitiga XSS refletido)
      .replace(/['"`;]/g, '')     // remove caracteres usados em injeção de comandos/SQL
      .trim()
      .slice(0, 120);             // limite defensivo, mesmo que o front já limite
  }

  // ============================================================
  // REQUISITO (Autenticação): emite um token de sessão simplificado,
  // no mesmo formato de um JWT (header.payload.signature em base64),
  // para demonstrar o conceito — sem biblioteca de criptografia real.
  // ============================================================
  function emitirTokenSessao() {
    const header = btoa(JSON.stringify({ alg: 'DEMO', tipo: 'sessao-totem' }));
    const payload = btoa(JSON.stringify({ iat: Date.now(), ref: Math.random().toString(36).slice(2, 8) }));
    const assinaturaSimulada = btoa(header + payload).slice(0, 16);
    const token = `${header}.${payload}.${assinaturaSimulada}`;
    sessoesAtivas.set(token, { criadoEm: Date.now() });
    return token;
  }

  function validarTokenSessao(token) {
    return sessoesAtivas.has(token);
  }

  // ============================================================
  // REQUISITO (impedir requisições sucessivas): rate limiting.
  // ============================================================
  function verificarLimite() {
    const agora = Date.now();
    historicoDeRequisicoes = historicoDeRequisicoes.filter(t => agora - t < JANELA_MS);
    if (historicoDeRequisicoes.length >= LIMITE_NA_JANELA) return false;
    historicoDeRequisicoes.push(agora);
    return true;
  }

  // ============================================================
  // REQUISITO (Disponibilidade): circuit breaker para a dependência
  // (banco de dados) — se falhar repetidamente, para de insistir.
  // ============================================================
  function registrarResultadoBD(sucesso) {
    if (sucesso) {
      falhasSeguidasBD = 0;
      circuitoAberto = false;
    } else {
      falhasSeguidasBD++;
      if (falhasSeguidasBD >= LIMITE_FALHAS_CIRCUITO) {
        circuitoAberto = true;
        log('circuito do banco de dados ABERTO — bloqueando novas tentativas por segurança', 'err', '503');
      }
    }
    emitirEstado();
  }

  // ============================================================
  // REQUISITO (gestão de erros do lado do servidor): ponto único de
  // tratamento — nenhuma falha "estoura" sem virar uma resposta clara.
  // Mensagens para o usuário são sempre genéricas (Confidencialidade);
  // o detalhe técnico só vai para o log interno.
  // ============================================================
  function tratarRequisicao({ token, dados, chaveIdempotencia }) {
    return new Promise((resolve) => {

      if (!servidorNoAr) {
        resolve({ codigo: 500, tipo: 'err', msg: 'servidor indisponível no momento' });
        return;
      }

      if (!validarTokenSessao(token)) {
        resolve({ codigo: 401, tipo: 'err', msg: 'sessão inválida ou expirada — reinicie o atendimento' });
        return;
      }

      if (cacheDeRespostas.has(chaveIdempotencia)) {
        resolve({
          codigo: 200, tipo: 'warn',
          msg: 'requisição repetida (duplo clique) — devolvendo senha já gerada',
          senha: cacheDeRespostas.get(chaveIdempotencia),
        });
        return;
      }

      if (!verificarLimite()) {
        resolve({ codigo: 429, tipo: 'err', msg: 'limite de requisições excedido — aguarde alguns segundos' });
        return;
      }

      if (circuitoAberto) {
        resolve({ codigo: 503, tipo: 'err', msg: 'banco de dados considerado indisponível no momento' });
        return;
      }

      if (!bancoDeDadosDisponivel) {
        registrarResultadoBD(false);
        resolve({ codigo: 503, tipo: 'err', msg: 'falha ao consultar banco de dados' });
        return;
      }

      // Nome sanitizado antes de qualquer persistência/uso — REQUISITO
      // Integridade/Injeção: o servidor nunca confia no dado bruto do front.
      const nomeSeguro = sanitizarEntrada(dados.nome);

      registrarResultadoBD(true);
      ultimaSenhaSalva += 1;
      cacheDeRespostas.set(chaveIdempotencia, ultimaSenhaSalva);
      emitirEstado();
      resolve({
        codigo: 200, tipo: 'ok',
        msg: 'senha gerada e persistida com sucesso',
        senha: ultimaSenhaSalva,
        nomeSeguro,
      });
    });
  }

  // ============================================================
  // REQUISITO (Disponibilidade): fila — processa um pedido de cada
  // vez, evitando que um pico de gente sobrecarregue o servidor.
  // ============================================================
  function enfileirarRequisicao(pedido, onResultado) {
    filaDeRequisicoes.push({ pedido, onResultado });
    processarFila();
  }

  async function processarFila() {
    if (processandoFila) return;
    processandoFila = true;
    while (filaDeRequisicoes.length > 0) {
      const { pedido, onResultado } = filaDeRequisicoes.shift();
      const resultado = await tratarRequisicao(pedido);
      onResultado(resultado);
      await new Promise(r => setTimeout(r, 120));
    }
    processandoFila = false;
  }

  // ---- Simulações para demonstração ----
  function simularQuedaDeEnergia() {
    servidorNoAr = false;
    circuitoAberto = false;
    falhasSeguidasBD = 0;
    emitirEstado();
    log('--- servidor caiu (queda de energia simulada) ---', 'err', 'SIM');
    setTimeout(() => {
      servidorNoAr = true;
      emitirEstado();
      log(`servidor reiniciou e recuperou o estado — última senha salva: ${ultimaSenhaSalva}`, 'ok', 'BOOT');
    }, 2500);
  }

  function alternarFalhaBD() {
    bancoDeDadosDisponivel = !bancoDeDadosDisponivel;
    log(
      bancoDeDadosDisponivel ? 'banco de dados voltou ao normal' : '--- simulando banco de dados indisponível ---',
      bancoDeDadosDisponivel ? 'ok' : 'warn', 'SIM'
    );
  }

  function estadoAtual() {
    return { servidorNoAr, circuitoAberto, ultimaSenhaSalva };
  }

  return {
    onLog, onEstado, log,
    emitirTokenSessao, validarTokenSessao,
    sanitizarEntrada,
    enfileirarRequisicao,
    simularQuedaDeEnergia, alternarFalhaBD,
    estadoAtual, emitirEstado,
  };
})();
