# Checklist de testes manuais

Roteiro para rodar antes da apresentação — abra `src/index.html` no
navegador e siga cada passo. Marque conforme for validando.

## Formulário (Tela 1)

- [ ] Tentar enviar o formulário vazio → deve mostrar erro em cada campo obrigatório, sem enviar nada
- [ ] Digitar CPF só com números → deve formatar sozinho como `000.000.000-00`
- [ ] Digitar telefone só com números → deve formatar como `(00) 00000-0000`
- [ ] Digitar um e-mail inválido (ex.: `teste@`) → deve mostrar erro
- [ ] Deixar o formulário parado por ~15s → deve aparecer o aviso de inatividade com contagem regressiva
- [ ] Deixar o aviso chegar a zero → campos devem ser limpos
- [ ] Preencher tudo corretamente e enviar → deve abrir o popup de confirmação com os dados corretos

## Confirmação e emissão de senha

- [ ] Clicar em "Corrigir" no popup → deve voltar ao formulário sem perder os dados digitados
- [ ] Clicar em "Confirmar e gerar senha" → deve ir para a Tela 2 com um número de senha e saudação com o nome

## Console do servidor (Tela 2)

- [ ] Clicar em "Cliente clicando 20x seguidas" → observar no console o rate limiting bloqueando (`429`) após poucos cliques
- [ ] Clicar em "Banco de dados fora do ar" → próximas tentativas devem falhar (`503`); clicar de novo restabelece
- [ ] Deixar o banco "fora do ar" por 3 tentativas seguidas → circuito deve abrir (ver `state-circuito` = "aberto")
- [ ] Clicar em "Queda de energia no servidor" → servidor mostra "fora do ar" por ~2,5s e depois volta, mantendo a última senha salva

## Segurança (verificação manual de código, não só da UI)

- [ ] Digitar `<script>alert(1)</script>` no campo nome e confirmar → o valor não deve aparecer como HTML executável em nenhuma tela (ver `saudacao-usuario` usando `textContent`, nunca `innerHTML` cru)
- [ ] Abrir o DevTools → Network e conferir que não há nenhuma requisição saindo para domínios externos (tudo roda local)
- [ ] Conferir a resposta de erro (`ticket-status`) em qualquer cenário de falha → nunca deve mostrar stack trace, nome de função interna ou detalhe de implementação

## Responsividade

- [ ] Reduzir a largura da janela (ou usar o modo responsivo do DevTools) → o layout de duas colunas da Tela 2 deve empilhar verticalmente abaixo de 860px
