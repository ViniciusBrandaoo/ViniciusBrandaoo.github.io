/* ============================================================================
   Cliente HTTP mínimo para o servidor real (`servidor/indice.ts`).
   Só existe e só é chamado quando `L.USA_BACKEND` está ligado — no modo
   localStorage este arquivo carrega junto mas L.api nunca é usado.
   ========================================================================== */

L.api = {};

/**
 * `credentials:"include"` é o que manda o cookie de sessão (httpOnly, não
 * dá para o JS ler nem enviar à mão) em toda chamada — sem isso cada
 * requisição chegaria ao servidor como anônima, mesmo logo depois do login.
 */
L.api._emAndamento = {};
// Identifica esta aba: o servidor avisa as OUTRAS abas quando alguém grava.
L.api.abaId = Math.random().toString(36).slice(2) + Date.now().toString(36);

L.api.chamar = function (metodo, caminho, corpo) {
  // Duplo clique em "Salvar"/"Calcular" não pode gravar duas vezes: pedido
  // idêntico (mesmo método, caminho e corpo) ainda em andamento devolve a
  // mesma promessa em vez de disparar outro.
  var chave = null;
  if (metodo !== "GET") {
    chave = metodo + " " + caminho + " " + (corpo ? JSON.stringify(corpo) : "");
    if (L.api._emAndamento[chave]) return L.api._emAndamento[chave];
  }
  var promessa = fetch(caminho, {
    method: metodo,
    credentials: "include",
    headers: corpo ? { "Content-Type": "application/json", "X-Aba": L.api.abaId } : { "X-Aba": L.api.abaId },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }).catch(function () {
    var erro = new Error("Sem conexão com o servidor. Confira a internet e tente de novo. Antes de repetir um lançamento, veja na lista se ele já não foi gravado.");
    erro.status = 0;
    throw erro;
  }).then(function (resp) {
    // 204 (sem corpo) e respostas sem JSON não têm o que decodificar.
    var vazio = resp.status === 204;
    return (vazio ? Promise.resolve(null) : resp.json().catch(function () { return null; }))
      .then(function (dados) {
        if (!resp.ok) {
          var mensagem = (dados && dados.erro) || "Não foi possível completar a ação (HTTP " + resp.status + ").";
          if (resp.status === 401 && caminho.indexOf("/api/acesso/entrar") !== 0) {
            mensagem = "Sua sessão expirou. Entre de novo para continuar (se estava salvando algo, confira na lista depois de entrar).";
          }
          var erro = new Error(mensagem);
          erro.status = resp.status;
          throw erro;
        }
        // Edição do RH que vai para a Direção aceitar ou recusar: avisa quem editou.
        if (dados && dados.aprovacao && typeof L.aoEnviarParaAprovacao === "function") L.aoEnviarParaAprovacao(dados.aprovacao);
        return dados;
      });
  });
  if (chave) {
    L.api._emAndamento[chave] = promessa;
    var liberar = function () { delete L.api._emAndamento[chave]; };
    promessa.then(liberar, liberar);
  }
  return promessa;
};

L.api.get = function (caminho) { return L.api.chamar("GET", caminho); };
L.api.post = function (caminho, corpo) { return L.api.chamar("POST", caminho, corpo); };
L.api.patch = function (caminho, corpo) { return L.api.chamar("PATCH", caminho, corpo); };
L.api.del = function (caminho) { return L.api.chamar("DELETE", caminho); };

/**
 * Único caso com arquivo (Central de Documentos): `FormData`, não JSON, e
 * sem `Content-Type` explícito — o navegador escreve o boundary do
 * multipart sozinho; declarar a mão quebra o parse no servidor.
 */
L.api.enviarArquivo = function (caminho, campos) {
  var forma = new FormData();
  Object.keys(campos).forEach(function (chave) {
    if (campos[chave] !== null && campos[chave] !== undefined) forma.append(chave, campos[chave]);
  });
  return fetch(caminho, { method: "POST", credentials: "include", body: forma }).then(function (resp) {
    return resp.json().catch(function () { return null; }).then(function (dados) {
      if (!resp.ok) {
        var erro = new Error((dados && dados.erro) || "Não foi possível completar a ação (HTTP " + resp.status + ").");
        erro.status = resp.status;
        throw erro;
      }
      return dados;
    });
  });
};
