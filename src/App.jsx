import React, { useState, useEffect, useCallback } from 'react';
import { supabase, sendPushNotification } from './services/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { LayoutDashboard, Users, ClipboardList, DollarSign, RefreshCw, Wifi, WifiOff, X, CheckCircle, XCircle, FileText, Menu } from 'lucide-react';
import AnalyticsPage from './pages/Analytics';
import TasksPage from './pages/Tasks';
import PaymentsPage from './pages/Payments';
import './App.css';

const STATUS_COLORS = {
  pending:  { bg: '#FEF3C7', text: '#92400E', dot: '#D97706', label: 'Pending' },
  approved: { bg: '#E8F5F0', text: '#065F46', dot: '#0A9B6A', label: 'Approved' },
  rejected: { bg: '#FEE2E2', text: '#7F1D1D', dot: '#DC2626', label: 'Rejected' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,backgroundColor:s.bg,color:s.text,fontSize:11,fontWeight:700 }}>
      <span style={{ width:7,height:7,borderRadius:'50%',backgroundColor:s.dot,display:'inline-block' }} />
      {s.label}
    </span>
  );
}

function AgentDetailModal({ agent, onClose, onApprove, onReject }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!agent) return null;

  const handleApprove = async () => { setLoading(true); await onApprove(agent); setLoading(false); onClose(); };
  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Please enter a rejection reason'); return; }
    setLoading(true); await onReject(agent, rejectReason.trim()); setLoading(false); onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{agent.full_name}</h2>
            <p className="modal-sub">{agent.agent_id_code} · {agent.email}</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <DetailRow label="Status" value={<StatusBadge status={agent.status} />} />
            <DetailRow label="Mobile" value={agent.mobile || '—'} />
            <DetailRow label="City / State" value={`${agent.city || '—'}, ${agent.state || '—'}`} />
            <DetailRow label="Aadhaar No." value={agent.aadhaar_number ? `xxxx xxxx ${agent.aadhaar_number.slice(-4)}` : '—'} />
            <DetailRow label="Name on Aadhaar" value={agent.name_as_per_aadhaar || '—'} />
            <DetailRow label="Account Holder" value={agent.account_holder_name || '—'} />
            <DetailRow label="Bank / IFSC" value={agent.bank_name ? `${agent.bank_name} · ${agent.ifsc_code}` : agent.ifsc_code || '—'} />
            <DetailRow label="Registered" value={new Date(agent.created_at).toLocaleDateString('en-IN', { day:'numeric',month:'short',year:'numeric' })} />
          </div>

          {agent.aadhaar_front_url && (
            <div className="docs-section">
              <p className="docs-title">Documents</p>
              <div className="docs-row">
                <a href={agent.aadhaar_front_url} target="_blank" rel="noreferrer" className="doc-link"><FileText size={14} /> Aadhaar Front</a>
                {agent.aadhaar_back_url && <a href={agent.aadhaar_back_url} target="_blank" rel="noreferrer" className="doc-link"><FileText size={14} /> Aadhaar Back</a>}
                {agent.profile_photo_url && <a href={agent.profile_photo_url} target="_blank" rel="noreferrer" className="doc-link"><FileText size={14} /> Profile Photo</a>}
              </div>
            </div>
          )}

          {agent.status === 'pending' && (
            <div className="action-bar">
              {!showRejectForm ? (
                <>
                  <button className="btn-approve" onClick={handleApprove} disabled={loading}>
                    {loading ? 'Processing…' : 'Approve Agent'}
                  </button>
                  <button className="btn-reject-outline" onClick={() => setShowRejectForm(true)}>Reject</button>
                </>
              ) : (
                <div className="reject-form">
                  <p className="reject-label">Rejection reason (shown to agent)</p>
                  <textarea className="reject-textarea" placeholder="e.g. Aadhaar photo unclear…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} />
                  <div className="reject-actions">
                    <button className="btn-reject" onClick={handleReject} disabled={loading}>{loading ? '…' : 'Confirm Rejection'}</button>
                    <button className="btn-cancel" onClick={() => setShowRejectForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Users, label: 'Agents' },
  { icon: ClipboardList, label: 'Tasks' },
  { icon: DollarSign, label: 'Earnings' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [stats, setStats] = useState({ pending:0, approved:0, rejected:0, total:0 });

  const fetchAgents = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: fetchError } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      if (data) {
        setAgents(data);
        setStats({
          pending:  data.filter(a => a.status === 'pending').length,
          approved: data.filter(a => a.status === 'approved').length,
          rejected: data.filter(a => a.status === 'rejected').length,
          total:    data.length,
        });
      }
    } catch (err) {
      setError(err.message);
      toast.error(`Connection Error: ${err.message}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAgents();
    const channel = supabase.channel('admin_agents_all')
      .on('postgres_changes', { event:'*', schema:'public', table:'agents' }, fetchAgents)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAgents]);

  const handleApprove = async (agent) => {
    try {
      const { error: updateError } = await supabase.from('agents')
        .update({ 
          status:'approved', 
          verified_at: new Date().toISOString(), 
          rejection_reason: null,
          aadhaar_status: 'verified',
          aadhaar_verified_at: new Date().toISOString()
        })
        .eq('id', agent.id);
      if (updateError) throw updateError;
      toast.success(`${agent.full_name} approved`);
      if (agent.expo_push_token) await sendPushNotification(agent.expo_push_token, 'Application Approved', 'Your TaskForce Pro application has been approved. Welcome aboard!');
      fetchAgents();
    } catch { toast.error('Failed to approve agent'); }
  };

  const handleReject = async (agent, reason) => {
    try {
      const { error: updateError } = await supabase.from('agents').update({ status:'rejected', rejection_reason: reason }).eq('id', agent.id);
      if (updateError) throw updateError;
      toast.success('Agent rejected');
      if (agent.expo_push_token) await sendPushNotification(agent.expo_push_token, 'Application Update', `Update: ${reason}`);
      fetchAgents();
    } catch { toast.error('Failed to reject agent'); }
  };

  const filteredAgents = agents.filter(a => {
    const matchStatus = filter === 'all' || a.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || (a.full_name||'').toLowerCase().includes(q) || (a.email||'').toLowerCase().includes(q) || (a.agent_id_code||'').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const STAT_CARDS = [
    { label:'Total Employees', value: stats.total,    color:'#0A9B6A', bg:'#E8F5F0', Icon: Users },
    { label:'Pending Review',  value: stats.pending,  color:'#D97706', bg:'#FEF3C7', Icon: ClipboardList },
    { label:'Approved',        value: stats.approved, color:'#0A9B6A', bg:'#E8F5F0', Icon: CheckCircle },
    { label:'Rejected',        value: stats.rejected, color:'#DC2626', bg:'#FEE2E2', Icon: XCircle },
  ];

  const renderContent = () => {
    if (activeTab === 'Dashboard') return <AnalyticsPage />;
    if (activeTab === 'Tasks')     return <TasksPage />;
    if (activeTab === 'Earnings')  return <PaymentsPage />;

    return (
      <>
        <div className="stats-row">
          {STAT_CARDS.map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-header">
                <div className="stat-icon" style={{ background: s.bg }}>
                  <s.Icon size={20} color={s.color} />
                </div>
                <span className="stat-trend up">Live</span>
              </div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="filter-bar">
          <div className="filter-tabs">
            {['all','pending','approved','rejected'].map(f => (
              <button key={f} className={`filter-tab ${filter===f?'filter-tab-active':''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
          </div>
          <input className="search-input" placeholder="Search by name, email or ID…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="loading-row"><div className="spinner" /><span>Loading agents…</span></div>
          ) : error ? (
            <div className="error-row">
              <p>Error: {error}</p>
              <button className="refresh-btn" onClick={fetchAgents}>Retry</button>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="empty-row"><p>No agents found</p></div>
          ) : (
            <div className="table-container">
              <table className="agents-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map(agent => (
                    <tr key={agent.id} className="agent-row" onClick={() => setSelectedAgent(agent)}>
                      <td>
                        <div className="agent-name-cell">
                          <div className="agent-avatar">{agent.full_name?.charAt(0)}</div>
                          <div>
                            <div className="agent-name">{agent.full_name}</div>
                            <div className="agent-id">{agent.agent_id_code}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="agent-email">{agent.email}</div>
                        <div className="agent-mobile">{agent.mobile}</div>
                      </td>
                      <td style={{ color:'var(--text-sub)', fontSize:13 }}>{agent.city || '—'}, {agent.state || '—'}</td>
                      <td><StatusBadge status={agent.status} /></td>
                      <td className="date-cell">{new Date(agent.created_at).toLocaleDateString('en-IN')}</td>
                      <td><button className="view-btn" onClick={e => { e.stopPropagation(); setSelectedAgent(agent); }}>View Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="admin-root">
      <Toaster position="top-right" toastOptions={{ style:{ fontFamily:'Inter,sans-serif', fontSize:13 } }} />

      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-circle">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <div className="sidebar-logo-name">TaskForce Pro</div>
            <div className="sidebar-logo-sub">Admin Console</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-section">Main Menu</div>
          {NAV_ITEMS.map(({ icon: Icon, label }) => (
            <button key={label} className={`nav-item ${activeTab===label?'nav-item-active':''}`} onClick={() => { setActiveTab(label); setIsSidebarOpen(false); }}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version">v2.0.0 · Production</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <h1 className="topbar-title">{activeTab}</h1>
              <p className="topbar-sub">Manage your field operations</p>
            </div>
          </div>
          <div className="topbar-right">
            <div className={`connection-badge ${error?'offline':'online'}`}>
              <span className="connection-dot" />
              {error ? 'Connection Error' : 'Supabase Live'}
            </div>
            <button className="refresh-btn" onClick={fetchAgents}><RefreshCw size={14} /> Refresh</button>
          </div>
        </header>

        {renderContent()}
      </main>

      {selectedAgent && (
        <AgentDetailModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} onApprove={handleApprove} onReject={handleReject} />
      )}
    </div>
  );
}
