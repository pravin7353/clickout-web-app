export function buildInvoiceData(order: any, store: any, config: any) {
  const items = order.cartItems || order.items || [];
  let totalGstAmount = 0;
  let totalBaseAmount = 0;
  let totalGross = 0;

  const processedItems = items.map((item: any) => {
    const qty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || item.unitPrice || item.mrp || 0);
    const itemTotal = qty * price;
    const gstRate = item.gst !== undefined ? Number(String(item.gst).replace(/[^0-9.]/g, '')) : 18.0;

    const baseTotal = itemTotal / (1 + (gstRate / 100));
    const gstAmount = itemTotal - baseTotal;

    totalBaseAmount += baseTotal;
    totalGstAmount += gstAmount;
    totalGross += itemTotal;

    return { name: item.name || 'Item', qty, price, itemTotal, gstRate, baseTotal, gstAmount };
  });

  const title = totalGstAmount > 0 ? "TAX INVOICE" : "BILL OF SUPPLY";
  const gstin = store?.gstin || store?.licenses?.find((l: any) => l.type === 'GSTIN')?.number || 'N/A';
  const address = [store?.address, store?.city, store?.pincode].filter(Boolean).join(", ") || 'N/A';
  
  // Extract Bank Details if available
  const bank = store?.bankAccounts?.[0];
  const bankDetails = bank ? `Bank: ${bank.bankName?.split('(')[0]?.trim() || ''} | A/C: ${bank.accountNo} | IFSC: ${bank.ifsc}` : null;

  return {
    title,
    storeName: (store?.storeName || order.branchCode || 'CLICKOUT RETAIL').toUpperCase(),
    address,
    gstin,
    bankDetails,
    upi: bank?.upi || null,
    invoiceNo: order.invoiceNo || `${config?.prefix || config?.invoicePrefix || 'INV/'}${order.id?.substring(0, 8).toUpperCase()}`,
    date: order.timestamp?.toDate ? order.timestamp.toDate() : new Date(),
    payMode: order.paymentMode || 'CASH',
    items: processedItems,
    totalBaseAmount,
    totalGstAmount,
    totalGross,
    grandTotal: Number(order.totalAmount || totalGross),
    terms: config?.terms ? String(config.terms).split(/\\n|\n/) : ["1. Goods once sold will not be refunded."]
  };
}