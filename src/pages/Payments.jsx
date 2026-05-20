import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { Download, CheckCircle, X, Upload, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';

export default function PaymentsPage() {
  const [pending, setPending]             = useState([]);
  const [recentTxs, setRecentTxs]         = useState([]);
  const [totalPending, setTotalPending]   = useState(0);
  const [totalReleased, setTotalReleased] = useState(0);
  const [selectedIds, setSelectedIds]     = useState([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: pendingTxs } = await supabase.from('transactions')
        .select('*, agents(id, full_name, agent_id_code, mobile, account_number, ifsc_code, account_holder_name, bank_name, upi_id)')
        .eq('type', 'withdrawal').eq('status', 'pending')
        .order('created_at', { ascending: true });

      const { data: allTxs } = await supabase.from('transactions')
        .select('*, agents(id, full_name, agent_id_code)')
        .order('created_at', { ascending: false }).limit(100);

      const mapped = (pendingTxs || []).map(tx => ({
        id:            tx.id,
        agent_id:      tx.agent_id,
        agent_name:    tx.agents?.full_name,
        agent_id_code: tx.agents?.agent_id_code,
        agent_mobile:  tx.agents?.mobile,
        amount:        tx.amount,
        created_at:    tx.created_at,
        reference_id:  tx.reference_id,
        bank_details:  tx.agents?.account_number ? {
          account_number: tx.agents.account_number,
          ifsc_code:      tx.agents.ifsc_code,
          holder_name:    tx.agents.account_holder_name,
          bank_name:      tx.agents.bank_name
        } : null,
        agent_upi:     tx.agents?.upi_id || null
      }));

      const released = (allTxs || []).filter(t => (t.type === 'task_reward' || t.type === 'withdrawal') && (t.status === 'completed' || t.status === 'approved') && !t.status?.includes('pending'));
      setTotalReleased(released.reduce((s, t) => s + Number(t.amount || 0), 0));

      setPending(mapped);
      setTotalPending(mapped.reduce((s, p) => s + Number(p.amount), 0));
      setRecentTxs(allTxs || []);
    } catch {
      toast.error('Failed to load payment data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const ch = supabase.channel('admin_payments_rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'transactions' }, loadData)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadData]);

  const toggleSelect  = id  => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll     = ()  => setSelectedIds(selectedIds.length === pending.length ? [] : pending.map(p => p.id));

  const handleApproveWithReceipt = async (receiptFile) => {
    const selectedTxs = pending.filter(p => selectedIds.includes(p.id));
    const total = selectedTxs.reduce((s, p) => s + Number(p.amount), 0);
    try {
      let receiptUrl = null;
      if (receiptFile) {
        const path = `receipts/${Date.now()}_${receiptFile.name}`;
        const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, receiptFile, { upsert: true });
        if (uploadErr) {
          // Try to continue without receipt if bucket doesn't exist
          console.warn('Receipt upload skipped:', uploadErr.message);
        } else {
          const { data } = supabase.storage.from('payment-receipts').getPublicUrl(path);
          receiptUrl = data.publicUrl;
        }
      }

      for (const tx of selectedTxs) {
        const updateData = { status: 'completed' };
        if (receiptUrl) updateData.receipt_url = receiptUrl;
        await supabase.from('transactions').update(updateData).eq('id', tx.id);
        const { data: ag } = await supabase.from('agents').select('wallet_balance').eq('id', tx.agent_id).single();
        const bal = Number(ag?.wallet_balance || 0);
        await supabase.from('agents').update({ wallet_balance: Math.max(0, bal - Number(tx.amount)) }).eq('id', tx.agent_id);
      }

      toast.success(`${selectedTxs.length} payment(s) of ₹${total.toLocaleString('en-IN')} approved${receiptUrl ? ' with receipt' : ''}`);
      setSelectedIds([]); setShowApprovalModal(false); loadData();
    } catch { toast.error('Failed to process payments'); }
  };

  const exportCSV = () => {
    const rows = [
      ['ID','Type','Agent','Agent Code','Amount','Date','Status'],
      ...recentTxs.map(t => [t.id, t.type, t.agents?.full_name, t.agents?.agent_id_code, t.amount, new Date(t.created_at).toLocaleDateString('en-IN'), t.status]),
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const selectedTotal = pending.filter(p => selectedIds.includes(p.id)).reduce((s,p) => s + Number(p.amount), 0);

  const KPI = [
    { label:'Total Released', value:`₹${totalReleased.toLocaleString('en-IN')}`, color:'#0A9B6A', bg:'#E8F5F0' },
    { label:'Pending Withdrawals', value:`₹${totalPending.toLocaleString('en-IN')}`, color:'#D97706', bg:'#FEF3C7' },
    { label:'Pending Requests', value: pending.length, color:'#2563EB', bg:'#EFF6FF' },
    { label:'Recent Transactions', value: recentTxs.length, color:'#8FA89E', bg:'#F1F5F4' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Overview</h1>
          <p className="page-subtitle">Payment approvals, transaction history and payouts</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn-secondary" onClick={exportCSV}><Download size={15} /> Export CSV</button>
          <button
            className={`btn-primary ${selectedIds.length===0?'btn-disabled':''}`}
            onClick={() => selectedIds.length > 0 && setShowApprovalModal(true)}
            disabled={selectedIds.length===0}
          >
            <CheckCircle size={15} /> Approve Withdrawals ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid-4col" style={{ marginBottom:28 }}>
        {KPI.map(k => (
          <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.color}22`, borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:12, fontWeight:600, color:k.color, opacity:0.8, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? <div className="loading-spinner" /> : (
        <>
          {/* Pending Withdrawals */}
          <div style={{ marginBottom:32 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:'#0D1F1A' }}>Pending Withdrawal Requests</div>
                <div style={{ fontSize:13, color:'#8FA89E', marginTop:2 }}>Select requests to approve as a batch</div>
              </div>
              {selectedIds.length > 0 && (
                <div style={{ padding:'8px 16px', background:'#E8F5F0', border:'1px solid #B8E5D6', borderRadius:8, fontSize:13, fontWeight:700, color:'#0A9B6A' }}>
                  {selectedIds.length} selected · ₹{selectedTotal.toLocaleString('en-IN')}
                </div>
              )}
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={selectedIds.length===pending.length && pending.length>0} onChange={toggleAll} style={{ cursor:'pointer', accentColor:'#0A9B6A' }} /></th>
                    <th>Employee</th>
                    <th>Payout Method & Details</th>
                    <th>Amount Requested</th>
                    <th>Request Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.length === 0 ? (
                    <tr><td colSpan="6" className="empty-cell">No pending withdrawal requests</td></tr>
                  ) : pending.map(item => {
                    let method = 'bank';
                    if (item.reference_id && item.reference_id.startsWith('payout_method:')) {
                      method = item.reference_id.split(':')[1];
                    }
                    return (
                      <tr key={item.id} className={selectedIds.includes(item.id)?'row-selected':''}>
                        <td><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} style={{ cursor:'pointer', accentColor:'#0A9B6A' }} /></td>
                        <td>
                          <div className="agent-cell-name">{item.agent_name}</div>
                          <div className="agent-cell-id">{item.agent_id_code} · {item.agent_mobile}</div>
                        </td>
                        <td>
                          {method === 'upi' ? (
                            <div>
                              <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 13 }}>UPI</div>
                              <div style={{ fontSize: 12, color: '#4B6358' }}>{item.agent_upi || 'No UPI ID saved'}</div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 600, color: '#0A9B6A', fontSize: 13 }}>Bank Account</div>
                              {item.bank_details ? (
                                <div style={{ fontSize: 12, color: '#4B6358', lineHeight: 1.4 }}>
                                  <div>{item.bank_details.holder_name}</div>
                                  <div>{item.bank_details.bank_name} · {item.bank_details.account_number}</div>
                                  <div style={{ color: '#8FA89E' }}>IFSC: {item.bank_details.ifsc_code}</div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: '#DC2626' }}>No Bank Details saved</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:4, color:'#DC2626', fontWeight:700, fontSize:15 }}>
                            <ArrowUpRight size={14} /> ₹{Number(item.amount).toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td className="date-cell">{new Date(item.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</td>
                        <td><span className="badge badge-amber"><span className="badge-dot" /><Clock size={10} style={{ marginRight:2 }} /> Pending</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transaction History */}
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:'#0D1F1A', marginBottom:4 }}>Transaction History</div>
            <div style={{ fontSize:13, color:'#8FA89E', marginBottom:16 }}>All earnings and withdrawal transactions</div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Employee</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxs.length === 0 ? (
                    <tr><td colSpan="6" className="empty-cell">No transactions found</td></tr>
                  ) : recentTxs.map(tx => (
                    <tr key={tx.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background: tx.type==='task_reward'?'#E8F5F0':'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {tx.type === 'task_reward'
                              ? <ArrowDownLeft size={15} color="#0A9B6A" />
                              : <ArrowUpRight  size={15} color="#2563EB" />
                            }
                          </div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13, color:'#0D1F1A' }}>{tx.type === 'task_reward' ? 'Task Earnings' : 'Withdrawal'}</div>
                            <div style={{ fontSize:11, color:'#8FA89E' }}>{tx.type}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="agent-cell-name">{tx.agents?.full_name || '—'}</div>
                        <div className="agent-cell-id">{tx.agents?.agent_id_code}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight:700, fontSize:14, color: tx.type==='task_reward'?'#0A9B6A':'#DC2626' }}>
                          {tx.type==='task_reward' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="date-cell">{new Date(tx.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                      <td>
                        <span className={`badge ${tx.status==='completed'||tx.status==='approved'?'badge-green':tx.status==='pending'?'badge-amber':'badge-red'}`}>
                          <span className="badge-dot" />{tx.status || 'completed'}
                        </span>
                      </td>
                      <td>
                        {tx.receipt_url
                          ? <a href={tx.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'#0A9B6A', fontWeight:600, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}><Download size={13} /> View Receipt</a>
                          : <span style={{ fontSize:12, color:'#8FA89E' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showApprovalModal && (
        <ApprovalModal
          selectedTxs={pending.filter(p => selectedIds.includes(p.id))}
          total={selectedTotal}
          onClose={() => setShowApprovalModal(false)}
          onConfirm={handleApproveWithReceipt}
        />
      )}
    </div>
  );
}

function ApprovalModal({ selectedTxs, total, onClose, onConfirm }) {
  const [receiptFile, setReceiptFile] = useState(null);
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [isLoading, setIsLoading]     = useState(false);

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    setReceiptFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    await onConfirm(receiptFile);
    setIsLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth:520 }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Approve Withdrawals</h2>
            <p className="modal-sub">Review and upload a payment receipt</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Summary */}
          <div style={{ background:'#F8FAFB', border:'1px solid #E2E8E6', borderRadius:10, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#8FA89E', letterSpacing:1, textTransform:'uppercase', marginBottom:12 }}>Payment Summary</div>
            {selectedTxs.map(tx => {
              let method = 'bank';
              if (tx.reference_id && tx.reference_id.startsWith('payout_method:')) {
                method = tx.reference_id.split(':')[1];
              }
              const displayInfo = method === 'upi'
                ? `UPI: ${tx.agent_upi || 'None'}`
                : `Bank Account: ${tx.bank_details ? `${tx.bank_details.bank_name} - ${tx.bank_details.account_number}` : 'None'}`;
              return (
                <div key={tx.id} className="summary-item" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'6px 0' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:13 }}>{tx.agent_name}</div>
                    <div style={{ fontSize:11, color:'#8FA89E' }}>{tx.agent_id_code}</div>
                    <div style={{ fontSize:11, color:'#2563EB', fontWeight:500, marginTop:2 }}>{displayInfo}</div>
                  </div>
                  <div style={{ fontWeight:700, color:'#DC2626' }}>-₹{Number(tx.amount).toLocaleString('en-IN')}</div>
                </div>
              );
            })}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, paddingTop:12, borderTop:'2px solid #E2E8E6' }}>
              <div style={{ fontWeight:700, color:'#0D1F1A' }}>Total Payout</div>
              <div style={{ fontWeight:800, fontSize:20, color:'#0A9B6A' }}>₹{total.toLocaleString('en-IN')}</div>
            </div>
          </div>

          {/* Receipt Upload */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#4B6358', letterSpacing:0.5, textTransform:'uppercase', marginBottom:8 }}>Attach Payment Receipt (Optional)</div>
            <div style={{ fontSize:12, color:'#8FA89E', marginBottom:12 }}>Upload a bank receipt or payment proof. Employees will be able to view this in their app.</div>

            {previewUrl ? (
              <div style={{ position:'relative' }}>
                <img src={previewUrl} alt="Receipt preview" className="receipt-preview" />
                <button
                  onClick={() => { setReceiptFile(null); setPreviewUrl(null); }}
                  style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:6, background:'rgba(0,0,0,0.6)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="receipt-upload-area" htmlFor="receipt-upload">
                <Upload size={24} color="#8FA89E" style={{ margin:'0 auto 8px' }} />
                <div style={{ fontSize:14, fontWeight:600, color:'#4B6358' }}>Click to upload receipt</div>
                <div style={{ fontSize:12, color:'#8FA89E', marginTop:4 }}>PNG, JPG, PDF up to 5MB</div>
                <input id="receipt-upload" type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={handleFile} />
              </label>
            )}
          </div>

          <div className="grid-2col">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-success" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }} onClick={handleConfirm} disabled={isLoading}>
              {isLoading ? 'Processing…' : <><CheckCircle size={16} /> Confirm & Release</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
