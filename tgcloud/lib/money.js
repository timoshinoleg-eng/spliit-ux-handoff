// Port of Spliit's src/lib/shares.ts (MIT), largest-remainder/Hamilton method.
// Original source: https://github.com/spliit-app/spliit/blob/main/src/lib/shares.ts
// All amounts in minor units; do not use floating point for stored money.
export function requireMinor(value, name = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000_000) {
    throw new Error(`${name}: ожидается целая сумма в минимальных единицах`);
  }
  return value;
}
export function hashString(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
export function splitExpense({ id = '', amount, splitMode = 'EVENLY', paidFor }) {
  requireMinor(amount);
  if (!Array.isArray(paidFor) || !paidFor.length || paidFor.length > 100) {
    throw new Error('Выберите от 1 до 100 участников');
  }
  const entries = [...paidFor].sort((a, b) => a.participantId.localeCompare(b.participantId, 'en'));
  if (new Set(entries.map(x => x.participantId)).size !== entries.length) throw new Error('Повтор участников');
  if (!['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'].includes(splitMode)) throw new Error('Некорректный режим деления');
  const weights = entries.map(x => {
    const w = splitMode === 'EVENLY' ? 1 : x.shares;
    if (!Number.isSafeInteger(w) || w < 0) throw new Error('Доли должны быть целыми неотрицательными');
    return w;
  });
  const sum = weights.reduce((a,b) => a+b, 0);
  if (sum <= 0 || !Number.isSafeInteger(sum)) throw new Error('Сумма долей должна быть положительной');
  if (splitMode === 'BY_PERCENTAGE' && sum !== 10000) throw new Error('Проценты должны составлять 100,00%');
  if (splitMode === 'BY_AMOUNT' && sum !== amount) throw new Error('Точные доли должны суммироваться в сумму чека');
  const offset = id ? hashString(id) % entries.length : 0;
  // BigInt intermediates prevent loss of precision at high amounts/weights.
  const base = weights.map(w => Number(BigInt(amount)*BigInt(w)/BigInt(sum)));
  const remain = amount - base.reduce((a,b) => a+b, 0);
  const order = weights.map((w,i) => ({i, residue: BigInt(amount)*BigInt(w)%BigInt(sum)}))
    .sort((a,b) => a.residue!==b.residue ? (a.residue>b.residue?-1:1) : ((a.i - offset + entries.length) % entries.length) - ((b.i - offset + entries.length) % entries.length));
  for (let i=0; i<remain; i++) base[order[i].i]++;
  return entries.map((p,i) => ({participantId:p.participantId, shares:weights[i], amount:base[i]}));
}
