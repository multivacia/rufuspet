// Utilitários do formulário. A validação definitiva é feita em public/api/pedido.php.

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}
