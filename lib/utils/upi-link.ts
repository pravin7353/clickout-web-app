export function generateUpiLink(params: {
  upiId: string;
  upiName: string;
  amount: number;
  invoiceNo: string;
  storeName: string;
}): string {
  const tn = encodeURIComponent(`${params.storeName} - ${params.invoiceNo}`);
  const pn = encodeURIComponent(params.upiName);
  return `upi://pay?pa=${params.upiId}&pn=${pn}&am=${params.amount.toFixed(2)}&tn=${tn}&cu=INR`;
}

export function generateUpiQrDataUrl(upiLink: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
}
