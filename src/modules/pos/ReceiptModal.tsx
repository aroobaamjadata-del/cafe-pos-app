import { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../../store/appStore';

interface ReceiptModalProps {
  order: any;
  onClose: () => void;
}

export default function ReceiptModal({ order, onClose }: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const settings = useAppStore(s => s.settings);
  const currency = settings?.currency_symbol || '₨';

  const fmt = (v: number) => `${currency}${Number(v).toFixed(0)}`;
  const fmtDate = (d: string) => {
    try { return format(parseISO(d), 'dd/MM/yyyy h:mm a'); } catch { return d; }
  };

  const handlePrint = () => {
    const printContent = receiptRef.current?.innerHTML;
    const printWindow = window.open('', '_blank', 'width=380,height=600');
    if (printWindow && printContent) {
      printWindow.document.write(`
        <html><head><title>Receipt</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          h1 { font-size: 16px; margin-bottom: 2px; }
          h2 { font-size: 13px; margin-bottom: 4px; }
        </style></head>
        <body>${printContent}</body></html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-dark-800 border border-dark-600/50 rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/50">
          <h2 className="font-bold text-white text-lg font-display">Order Complete!</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Receipt Preview */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <div ref={receiptRef} className="bg-white text-black rounded-xl p-4 font-mono text-xs">
            {/* Header */}
            <div className="center mb-3">
              <h1 className="bold" style={{fontSize: 15}}>{settings?.cafe_name || 'Cloud n Cream'}</h1>
              <p>{settings?.cafe_address}</p>
              <p>{settings?.cafe_phone}</p>
            </div>

            <div className="divider" style={{borderTop: '1px dashed #000', margin: '6px 0'}} />

            <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
              <span>Order: {order.order_number}</span>
              <span>{fmtDate(order.created_at)}</span>
            </div>
            <div style={{fontSize: 11, marginTop: 2}}>Cashier: {order.cashier_name}</div>
            {order.customer_name && <div style={{fontSize: 11}}>Customer: {order.customer_name}</div>}

            <div className="divider" style={{borderTop: '1px dashed #000', margin: '6px 0'}} />

            {/* Items */}
            {(order.items || []).map((item: any, i: number) => (
              <div key={i} style={{marginBottom: 4}}>
                <div style={{fontWeight: 'bold', fontSize: 11}}>{item.product_name}</div>
                <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
                  <span>{item.quantity} x {fmt(item.unit_price)}</span>
                  <span>{fmt(item.line_total)}</span>
                </div>
              </div>
            ))}

            <div className="divider" style={{borderTop: '1px dashed #000', margin: '6px 0'}} />

            {/* Totals */}
            <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
              <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
                <span>Discount</span><span>-{fmt(order.discount_amount)}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
                <span>Tax</span><span>{fmt(order.tax_amount)}</span>
              </div>
            )}
            <div style={{display:'flex', justifyContent:'space-between', fontWeight:'bold', fontSize: 13, marginTop: 4, borderTop:'1px solid #000', paddingTop: 4}}>
              <span>TOTAL</span><span>{fmt(order.total)}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize: 11, marginTop: 4}}>
              <span>Paid ({order.payment_method})</span><span>{fmt(order.amount_paid)}</span>
            </div>
            {order.change_amount > 0 && (
              <div style={{display:'flex', justifyContent:'space-between', fontSize: 11}}>
                <span>Change</span><span>{fmt(order.change_amount)}</span>
              </div>
            )}

            <div className="divider" style={{borderTop: '1px dashed #000', margin: '6px 0'}} />
            <div style={{textAlign:'center', fontSize: 11}}>
              <p>{settings?.receipt_footer || 'Thank you for your visit!'}</p>
              <p style={{marginTop: 4, color:'#666'}}>Powered by Cloud n Cream POS</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={handlePrint} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <Printer size={16} />
            Print Receipt
          </button>
          <button onClick={onClose} className="btn-primary flex-1">
            New Order
          </button>
        </div>
      </div>
    </div>
  );
}
