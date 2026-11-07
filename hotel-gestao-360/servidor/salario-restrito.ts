/**
 * Oculta valores em dinheiro de quem tem salário restrito (filtro do servidor
 * para tudo que não é Direção). Só reconhece o dono da linha pelos campos
 * `id`, `employeeId`, `funcionarioId` ou `employee_id`: toda rota que lista
 * valores por pessoa precisa devolver um deles.
 */
const CAMPO_DINHEIRO = /valor|salario|hora|provent|desconto|liquido|custo|base|total|pensao|remuneracao|inss|irrf|vale|bolsa|auxilio|fgts|cantina|material|mensalidade|robotica|emprestimos|outros|adiantamento|retenc/i;
export const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function ocultarValores(no: unknown, ids: Set<string>): unknown {
  if (Array.isArray(no)) return no.map((x) => ocultarValores(x, ids));
  if (no && typeof no === "object") {
    const o = no as Record<string, unknown>;
    const dono = [o.id, o.employeeId, o.funcionarioId, o.employee_id].some((v) => typeof v === "string" && ids.has(v));
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (dono && (Array.isArray(v) || (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) && CAMPO_DINHEIRO.test(k))) {
        saida[k] = Array.isArray(v) ? [] : null;
      } else {
        saida[k] = ocultarValores(v, ids);
      }
    }
    if (dono) saida.salarioOculto = true;
    return saida;
  }
  return no;
}

