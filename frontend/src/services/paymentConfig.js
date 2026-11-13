
export const PAYMENT_CONFIG = {
  upiId: "9848599311-@2axl",
  payeeName: "Kairika Janardhan",
  amount: 1835,
  currency: "INR"
};

export function getMaintenanceUpiLink(flatNumber, billId) {
  const params = new URLSearchParams({
    pa: PAYMENT_CONFIG.upiId,
    pn: PAYMENT_CONFIG.payeeName,
    am: String(PAYMENT_CONFIG.amount),
    cu: PAYMENT_CONFIG.currency,
    tn: `Maintenance Flat ${flatNumber} Bill ${billId}`
  });

  return `upi://pay?${params.toString()}`;
}
