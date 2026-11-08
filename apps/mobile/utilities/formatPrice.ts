export const formatPrice = (num: number): string => {
  if (!num || isNaN(num)) return "0";

  if (num >= 1_000_000_000) {
    return `${parseFloat((num / 1_000_000_000).toFixed(2))}b`;
  } else if (num >= 1_000_000) {
    return `${parseFloat((num / 1_000_000).toFixed(2))}m`;
  } else if (num >= 1_000) {
    return `${parseFloat((num / 1_000).toFixed(2))}k`;
  }
  return num.toString();
};