import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 10, fontFamily: 'Helvetica' },
  refundBanner: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
    borderWidth: 1.5,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
    textAlign: 'center',
  },
  refundBannerText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  refundBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    marginVertical: 8,
  },
  refundBoxTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  refundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 9,
  },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  store: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  text: { textAlign: 'center', fontSize: 9, marginBottom: 2 },
  dash: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', marginVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomStyle: 'dashed', paddingBottom: 4, marginBottom: 4 },
  tr: { flexDirection: 'row', marginBottom: 4 },
  col1: { width: '40%' }, col2: { width: '15%', textAlign: 'center' }, 
  col3: { width: '20%', textAlign: 'right' }, col4: { width: '25%', textAlign: 'right' },
  bold: { fontWeight: 'bold' },
});

export function InvoiceDocument({ data }: { data: any }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Refund / Cancellation Banner */}
        {data.isRefunded && (
          <View style={s.refundBanner}>
            <Text style={s.refundBannerText}>
              CANCELLED / REFUNDED — GST CREDIT NOTE
            </Text>
            <Text style={{ fontSize: 8, color: '#b91c1c', textAlign: 'center', marginTop: 2 }}>
              Original invoice voided. Customer refund processed per retail accounting audit regulations.
            </Text>
          </View>
        )}

        <Text style={s.title}>{data.title}</Text>
        <Text style={s.store}>{data.storeName}</Text>
        {data.address !== 'N/A' && <Text style={s.text}>{data.address}</Text>}
        <Text style={s.text}>GSTIN: {data.gstin}</Text>
        <View style={s.dash} />

        <View style={s.row}>
          <Text><Text style={s.bold}>Inv:</Text> {data.invoiceNo}</Text>
          <Text>{new Date(data.date).toLocaleDateString()}</Text>
        </View>
        <View style={s.row}>
          <Text style={{ fontSize: 9 }}>Pay Mode: {data.payMode}</Text>
          {data.isRefunded && (
            <Text style={[s.bold, { color: '#dc2626', fontSize: 9 }]}>STATUS: REFUNDED</Text>
          )}
        </View>
        <View style={s.dash} />

        {/* Refund Summary Box */}
        {data.isRefunded && data.refundDetails && (
          <View style={s.refundBox}>
            <Text style={s.refundBoxTitle}>CREDIT NOTE & REVERSAL DETAILS</Text>
            <View style={s.refundRow}>
              <Text style={s.bold}>Refund Amount:</Text>
              <Text style={[s.bold, { color: '#dc2626' }]}>-Rs. {Number(data.refundDetails.amount).toFixed(2)}</Text>
            </View>
            <View style={s.refundRow}>
              <Text>Refund Method:</Text>
              <Text>{data.refundDetails.method}</Text>
            </View>
            <View style={s.refundRow}>
              <Text>Audit Reference / UTR:</Text>
              <Text>{data.refundDetails.reference}</Text>
            </View>
            <View style={s.refundRow}>
              <Text>Refund Date:</Text>
              <Text>{new Date(data.refundDetails.date).toLocaleString()}</Text>
            </View>
            <View style={s.refundRow}>
              <Text>Reason:</Text>
              <Text>{data.refundDetails.reason}</Text>
            </View>
          </View>
        )}
        
        {/* Original Line Items */}
        <View style={s.th}>
          <Text style={[s.col1, s.bold]}>ITEM</Text><Text style={[s.col2, s.bold]}>QTY</Text>
          <Text style={[s.col3, s.bold]}>RATE</Text><Text style={[s.col4, s.bold]}>AMT</Text>
        </View>
        {data.items.map((item: any, i: number) => (
          <View key={i} style={s.tr}>
            <Text style={s.col1}>{item.name}</Text><Text style={s.col2}>{item.qty}</Text>
            <Text style={s.col3}>{item.price.toFixed(2)}</Text>
            <Text style={[s.col4, s.bold]}>{item.itemTotal.toFixed(2)}</Text>
          </View>
        ))}
        <View style={s.dash} />
        
        <View style={s.row}><Text>Gross Subtotal:</Text><Text>{data.totalGross.toFixed(2)}</Text></View>
        <View style={s.row}><Text>Taxable Value:</Text><Text>{data.totalBaseAmount.toFixed(2)}</Text></View>
        <View style={s.row}><Text>Total GST:</Text><Text>{data.totalGstAmount.toFixed(2)}</Text></View>
        <View style={s.dash} />
        
        <View style={s.row}>
          <Text style={[s.bold, { fontSize: 11 }]}>
            {data.isRefunded ? "ORIGINAL TOTAL" : "GRAND TOTAL"}
          </Text>
          <Text style={[s.bold, { fontSize: 13, textDecoration: data.isRefunded ? 'line-through' : 'none' }]}>
            Rs. {data.grandTotal.toFixed(2)}
          </Text>
        </View>

        {data.isRefunded && data.refundDetails && (
          <View style={[s.row, { marginTop: 4 }]}>
            <Text style={[s.bold, { fontSize: 11, color: '#dc2626' }]}>NET REVISED PAYABLE</Text>
            <Text style={[s.bold, { fontSize: 13, color: '#dc2626' }]}>
              Rs. {Math.max(0, data.grandTotal - data.refundDetails.amount).toFixed(2)}
            </Text>
          </View>
        )}
        <View style={s.dash} />
        
        {data.bankDetails && (
          <View>
            <Text style={[s.text, s.bold]}>SETTLEMENT DETAILS</Text>
            <Text style={s.text}>{data.bankDetails}</Text>
            {data.upi && <Text style={s.text}>UPI: {data.upi}</Text>}
            <View style={s.dash} />
          </View>
        )}
        <Text style={[s.text, s.bold, { marginTop: 4 }]}>Thank you for shopping with us!</Text>
        {data.terms.map((t: string, i: number) => <Text key={i} style={s.text}>{t}</Text>)}
      </Page>
    </Document>
  );
}