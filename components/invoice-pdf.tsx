import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 20, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  store: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  text: { textAlign: 'center', fontSize: 9, marginBottom: 2 },
  dash: { borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', marginVertical: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomStyle: 'dashed', paddingBottom: 4, marginBottom: 4 },
  tr: { flexDirection: 'row', marginBottom: 4 },
  col1: { width: '40%' }, col2: { width: '15%', textAlign: 'center' }, 
  col3: { width: '20%', textAlign: 'right' }, col4: { width: '25%', textAlign: 'right' },
  bold: { fontWeight: 'bold' }
});

export function InvoiceDocument({ data }: { data: any }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{data.title}</Text>
        <Text style={s.store}>{data.storeName}</Text>
        {data.address !== 'N/A' && <Text style={s.text}>{data.address}</Text>}
        <Text style={s.text}>GSTIN: {data.gstin}</Text>
        <View style={s.dash} />
        <View style={s.row}>
          <Text><Text style={s.bold}>Inv:</Text> {data.invoiceNo}</Text>
          <Text>{new Date(data.date).toLocaleDateString()}</Text>
        </View>
        <Text style={{ fontSize: 9 }}>Pay Mode: {data.payMode}</Text>
        <View style={s.dash} />
        
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
          <Text style={[s.bold, { fontSize: 11 }]}>GRAND TOTAL</Text>
          <Text style={[s.bold, { fontSize: 13 }]}>Rs. {data.grandTotal.toFixed(2)}</Text>
        </View>
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