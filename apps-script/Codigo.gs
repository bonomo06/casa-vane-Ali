/**
 * Web App que serve a lista de convidados para o site do casamento e grava as
 * confirmações de presença de volta na planilha.
 *
 * POR QUE ISTO EXISTE
 * Uma API key do Google só lê dados públicos — tentar escrever devolve
 * 401 "API keys are not supported by this API". Escrever exige uma credencial
 * que identifique uma pessoa, e nenhuma delas pode morar num site estático:
 * quem abrisse o código-fonte poderia editar ou apagar a planilha inteira.
 * Este script resolve os dois problemas de uma vez. A autorização fica aqui
 * dentro, na conta Google dona da planilha; o site só conhece uma URL. E como
 * ele também faz a leitura, a planilha pode continuar PRIVADA — inclusive as
 * abas de custos, que não têm por que ser públicas.
 *
 * COMO PUBLICAR
 *   1. Abra a planilha → Extensões → Apps Script
 *   2. Apague o conteúdo do editor e cole este arquivo inteiro
 *   3. Salve (💾)
 *   4. Implantar → Nova implantação → tipo "App da Web"
 *        Executar como:      Eu (seu e-mail)
 *        Quem tem acesso:    Qualquer pessoa
 *   5. Autorize quando o Google pedir (é a sua própria planilha)
 *   6. Copie a URL gerada e cole em js/sheets-client.js, em URL_APPS_SCRIPT
 *
 * "Qualquer pessoa" libera chamar esta URL, não abrir a planilha. O que a URL
 * permite fazer é só o que está escrito abaixo: ler nomes e marcar presença.
 *
 * AO ALTERAR ESTE ARQUIVO é preciso republicar em
 * Implantar → Gerenciar implantações → editar → Versão: Nova versão.
 * Salvar sozinho não atualiza a URL publicada.
 */

const ABA = 'Convidados';

const COL_NOME = 1;           // A
const COL_CONFIRMACAO = 2;    // B
const COL_CONFIRMADO_EM = 3;  // C — criada por este script
const PRIMEIRA_LINHA = 2;     // a linha 1 é o cabeçalho

const CONFIRMACOES_VALIDAS = ['pago', 'recusado'];

/**
 * Linhas que reservam lugar da banda e não são convidados nomeados. Ficam na
 * planilha para a contagem fechar, mas não aparecem na busca do site — senão
 * alguém digitando "banda" acharia esses registros.
 */
function ehPlaceholder(nome) {
  return /^banda\s*\d+$/i.test(nome);
}

function abaConvidados_() {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
  if (!aba) throw new Error('Aba "' + ABA + '" não encontrada na planilha.');
  return aba;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Normaliza o que está na coluna B para 'pago', 'recusado' ou null. */
function lerConfirmacao_(bruto) {
  const valor = String(bruto || '').trim().toLowerCase();
  return CONFIRMACOES_VALIDAS.indexOf(valor) !== -1 ? valor : null;
}

function lerConvidados_() {
  const aba = abaConvidados_();
  const ultima = aba.getLastRow();
  if (ultima < PRIMEIRA_LINHA) return [];

  const valores = aba
    .getRange(PRIMEIRA_LINHA, COL_NOME, ultima - PRIMEIRA_LINHA + 1, 2)
    .getValues();

  const lista = [];
  valores.forEach(function (linha) {
    const nome = String(linha[0] || '').trim();
    if (!nome || ehPlaceholder(nome)) return;
    lista.push({ nome: nome, confirmacao: lerConfirmacao_(linha[1]) });
  });
  return lista;
}

/** Cria o cabeçalho da coluna C na primeira vez que alguém confirma. */
function garantirCabecalhoData_(aba) {
  const celula = aba.getRange(1, COL_CONFIRMADO_EM);
  if (!String(celula.getValue() || '').trim()) {
    celula.setValue('Confirmado em');
  }
}

function doGet() {
  try {
    return json_({ ok: true, convidados: lerConvidados_() });
  } catch (erro) {
    return json_({ ok: false, erro: String(erro) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Sem o lock, duas confirmações simultâneas poderiam ler a lista de nomes
    // ao mesmo tempo e escrever com base num estado desatualizado.
    lock.waitLock(20000);

    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, erro: 'requisição sem corpo' });
    }

    const corpo = JSON.parse(e.postData.contents);
    const nome = String(corpo.nome || '').trim();
    const confirmacao = String(corpo.confirmacao || '').trim().toLowerCase();

    if (!nome) {
      return json_({ ok: false, erro: 'nome vazio' });
    }
    if (CONFIRMACOES_VALIDAS.indexOf(confirmacao) === -1) {
      return json_({ ok: false, erro: 'confirmacao precisa ser "pago" ou "recusado"' });
    }
    if (ehPlaceholder(nome)) {
      return json_({ ok: false, erro: 'esse nome não pode confirmar presença' });
    }

    const aba = abaConvidados_();
    const ultima = aba.getLastRow();
    const nomes = aba
      .getRange(PRIMEIRA_LINHA, COL_NOME, ultima - PRIMEIRA_LINHA + 1, 1)
      .getValues();

    let linhaAlvo = -1;
    for (let i = 0; i < nomes.length; i++) {
      if (String(nomes[i][0] || '').trim() === nome) {
        linhaAlvo = PRIMEIRA_LINHA + i;
        break;
      }
    }
    if (linhaAlvo === -1) {
      return json_({ ok: false, erro: 'nome não encontrado na lista' });
    }

    garantirCabecalhoData_(aba);
    aba.getRange(linhaAlvo, COL_CONFIRMACAO).setValue(confirmacao);
    aba.getRange(linhaAlvo, COL_CONFIRMADO_EM).setValue(new Date());

    return json_({ ok: true, nome: nome, confirmacao: confirmacao, linha: linhaAlvo });
  } catch (erro) {
    return json_({ ok: false, erro: String(erro) });
  } finally {
    lock.releaseLock();
  }
}
