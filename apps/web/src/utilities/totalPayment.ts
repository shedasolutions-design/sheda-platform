import { formatPrice } from "./formatPrice";

// const totalPaymemt = ({pay,  additionPay} : TOTALPRICE): number => {
// const totalPaymemt = (pay: string = '0', additionPay: string | null = null): number => {

//     if (additionPay !== null)
//         return (
//             parseInt(pay, 10) + parseInt(additionPay, 10)
//         )

//     return parseInt(pay);
//     }
//     export default totalPaymemt;

export const getTotalAmount = (pay: string | number = "0", additionPay: string | number | null = null): number => {
  // Ensure we are working with strings
  const payStr = String(pay || "0");
  const additionPayStr = additionPay !== null ? String(additionPay) : "0";

  // Clean the strings by removing non-numeric characters (e.g., ₦, commas)
  const cleanPay = payStr.replace(/[^0-9.-]+/g, "");
  const cleanAdditionPay = additionPayStr.replace(/[^0-9.-]+/g, "");

  // Convert to numbers using parseFloat to handle decimals
  const payNumber = parseFloat(cleanPay) || 0; // Fallback to 0 if NaN
  const additionPayNumber = parseFloat(cleanAdditionPay) || 0; // Fallback to 0 if NaN

  // Calculate total
  return additionPay !== null ? payNumber + additionPayNumber : payNumber;
};

const totalPayment = (pay: string | number = "0", additionPay: string | number | null = null): string => {
  const totalPay = getTotalAmount(pay, additionPay);
  // Format the result in shorthand notation
  return formatPrice(totalPay);
};

export default totalPayment;