import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { 
  Package, Plus, Trash2, Edit2, Check, X, Filter, 
  TrendingUp, Coins, Users, AlertCircle, ShoppingBag, Eye, RefreshCw
} from 'lucide-react';

export default function InventoryPage() {
  const [activeSubTab, setActiveSubTab] = useState('requests'); // 'requests', 'analytics', 'catalog'
  const [loading, setLoading] = useState(true);

  // Data states
  const [products, setProducts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [agents, setAgents] = useState([]);

  // Catalog Form state
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [prodForm, setProdForm] = useState({ name: '', price: '', description: '' });
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Filters state
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'released', 'completed'

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch products
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
      if (prodErr) throw prodErr;
      setProducts(prodData || []);

      // 2. Fetch requests with nested items and products
      const { data: reqData, error: reqErr } = await supabase
        .from('product_requests')
        .select('*, agents(id, full_name, agent_id_code, mobile), product_request_items(*, products(*))')
        .order('created_at', { ascending: false });
      if (reqErr) throw reqErr;
      setRequests(reqData || []);

      // 3. Fetch approved agents list
      const { data: agentData, error: agentErr } = await supabase
        .from('agents')
        .select('id, full_name, agent_id_code')
        .eq('status', 'approved')
        .order('full_name', { ascending: true });
      if (agentErr) throw agentErr;
      setAgents(agentData || []);

    } catch (err) {
      toast.error(`Error loading data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Handle warehouse request approval/release
  const handleApproveRequest = async (reqId) => {
    const confirm = window.confirm('Are you sure you want to release these products to the agent?');
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('product_requests')
        .update({ status: 'released', approved_at: new Date().toISOString() })
        .eq('id', reqId);

      if (error) throw error;
      toast.success('Products successfully approved and released!');
      loadAllData();
    } catch (err) {
      toast.error(`Approval failed: ${err.message}`);
    }
  };

  // Handle product catalog form submit
  const handleCatalogSubmit = async (e) => {
    e.preventDefault();
    if (!prodForm.name.trim() || !prodForm.price) {
      toast.error('Product name and unit price are required');
      return;
    }
    const unitPrice = parseFloat(prodForm.price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      toast.error('Please enter a valid positive price');
      return;
    }

    setSubmittingProduct(true);
    try {
      if (editingProduct) {
        // Update product
        const { error } = await supabase
          .from('products')
          .update({
            name: prodForm.name.trim(),
            price: unitPrice,
            description: prodForm.description.trim()
          })
          .eq('id', editingProduct.id);
        if (error) throw error;
        toast.success('Product updated in catalog');
      } else {
        // Create new product
        const { error } = await supabase
          .from('products')
          .insert({
            name: prodForm.name.trim(),
            price: unitPrice,
            description: prodForm.description.trim()
          });
        if (error) throw error;
        toast.success('Product added to catalog');
      }
      setShowCatalogModal(false);
      setEditingProduct(null);
      setProdForm({ name: '', price: '', description: '' });
      loadAllData();
    } catch (err) {
      toast.error(`Catalog action failed: ${err.message}`);
    } finally {
      setSubmittingProduct(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    const confirm = window.confirm('Are you sure you want to delete this product? This may fail if there are active agent assignments.');
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Product deleted from catalog');
      loadAllData();
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
    }
  };

  const handleEditProduct = (prod) => {
    setEditingProduct(prod);
    setProdForm({
      name: prod.name,
      price: String(prod.price),
      description: prod.description || ''
    });
    setShowCatalogModal(true);
  };

  // Compile calculations for reports & analytics
  const getAnalytics = () => {
    let totalDistributedUnits = 0;
    let totalSoldUnits = 0;
    let totalUnsoldUnits = 0;
    let totalCompanyEarnings = 0;
    let totalCommissionsPaid = 0;

    const tableItems = [];

    // Filter requests
    const filteredRequests = requests.filter(req => {
      // Status filter
      if (filterStatus !== 'all' && req.status !== filterStatus) return false;
      // Agent filter
      if (filterAgent !== 'all' && req.agent_id !== filterAgent) return false;
      return true;
    });

    filteredRequests.forEach(req => {
      req.product_request_items.forEach(item => {
        // Product filter
        if (filterProduct !== 'all' && item.product_id !== filterProduct) return;

        const remaining = item.quantity - item.sold_quantity - item.returned_quantity;
        const totalValue = Number(item.products?.price || 0) * item.quantity;
        const soldValue = Number(item.products?.price || 0) * item.sold_quantity;
        
        // Split revenue: 35% commission, 65% company
        const commission = Math.round(soldValue * 0.35);
        const companyRev = Math.round(soldValue * 0.65);

        if (req.status === 'released' || req.status === 'completed') {
          totalDistributedUnits += item.quantity;
          totalSoldUnits += item.sold_quantity;
          totalUnsoldUnits += remaining;
          totalCommissionsPaid += commission;
          totalCompanyEarnings += companyRev;
        }

        tableItems.push({
          id: item.id,
          agentName: req.agents?.full_name || 'Unknown Agent',
          agentCode: req.agents?.agent_id_code || '—',
          productName: item.products?.name || 'Unknown Product',
          unitPrice: item.products?.price || 0,
          quantity: item.quantity,
          sold: item.sold_quantity,
          returned: item.returned_quantity,
          remaining: remaining,
          commission: commission,
          companyRev: companyRev,
          status: req.status,
          date: req.created_at
        });
      });
    });

    return {
      totalDistributedUnits,
      totalSoldUnits,
      totalUnsoldUnits,
      totalCommissionsPaid,
      totalCompanyEarnings,
      tableItems
    };
  };

  const analytics = getAnalytics();
  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="inventory-container">
      {/* Tab Navigation header */}
      <div className="tab-header-row">
        <div className="tab-pills">
          <button 
            className={`tab-pill ${activeSubTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('requests')}
          >
            <span>Agent Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="badge-count bg-amber">{pendingRequestsCount}</span>
            )}
          </button>
          <button 
            className={`tab-pill ${activeSubTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('analytics')}
          >
            Sales Reports & Filters
          </button>
          <button 
            className={`tab-pill ${activeSubTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('catalog')}
          >
            Manage Catalog
          </button>
        </div>

        <button className="refresh-btn-outline" onClick={loadAllData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="loading-row"><div className="spinner" /><span>Loading inventory...</span></div>
      ) : (
        <>
          {/* 1. AGENT REQUESTS TAB */}
          {activeSubTab === 'requests' && (
            <div className="tab-panel">
              <h2 className="panel-title">Pending Warehouse Releases</h2>
              <p className="panel-desc">Approve and release products when agents pick them up from the warehouse.</p>
              
              {requests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="empty-panel">
                  <ShoppingBag size={48} color="var(--text-sub)" />
                  <p>No pending product requests at the moment.</p>
                </div>
              ) : (
                <div className="requests-grid">
                  {requests.filter(r => r.status === 'pending').map(req => (
                    <div key={req.id} className="request-card">
                      <div className="req-header">
                        <div>
                          <h3 className="agent-name">{req.agents?.full_name}</h3>
                          <span className="agent-code">{req.agents?.agent_id_code}</span>
                        </div>
                        <span className="req-date">
                          {new Date(req.created_at).toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      
                      {req.notes && (
                        <div className="req-notes">
                          <strong>Note:</strong> "{req.notes}"
                        </div>
                      )}

                      <div className="req-items">
                        <p className="items-title">Requested Items</p>
                        <table className="items-table-mini">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>Qty</th>
                              <th>Est. Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {req.product_request_items.map(item => (
                              <tr key={item.id}>
                                <td>{item.products?.name}</td>
                                <td>{item.quantity}</td>
                                <td>{(item.products?.price * item.quantity).toLocaleString('en-IN')} INR</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="req-actions">
                        <button 
                          className="btn-primary"
                          style={{ width: '100%', justifyContent: 'center' }}
                          onClick={() => handleApproveRequest(req.id)}
                        >
                          <Check size={14} />
                          <span>Approve & Release Items</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. SALES REPORTS & FILTERS TAB */}
          {activeSubTab === 'analytics' && (
            <div className="tab-panel">
              {/* Analytics summary row */}
              <div className="stats-row grid-4col">
                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon" style={{ background: '#E8F5F0' }}>
                      <Package size={20} color="#0A9B6A" />
                    </div>
                    <span className="stat-trend up">Distributed</span>
                  </div>
                  <div className="stat-value text-green">{analytics.totalDistributedUnits} units</div>
                  <div className="stat-label">Total Products Released</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon" style={{ background: '#E0F2FE' }}>
                      <ShoppingBag size={20} color="#0369A1" />
                    </div>
                    <span className="stat-trend up">Sold</span>
                  </div>
                  <div className="stat-value text-blue">{analytics.totalSoldUnits} units</div>
                  <div className="stat-label">Total Products Sold ({analytics.totalDistributedUnits > 0 ? Math.round((analytics.totalSoldUnits/analytics.totalDistributedUnits)*100) : 0}%)</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon" style={{ background: '#FEF3C7' }}>
                      <Coins size={20} color="#D97706" />
                    </div>
                    <span className="stat-trend warning">Commissions</span>
                  </div>
                  <div className="stat-value text-amber">₹{analytics.totalCommissionsPaid.toLocaleString('en-IN')}</div>
                  <div className="stat-label">Agent Commission (35%)</div>
                </div>

                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon" style={{ background: '#F0FDF4' }}>
                      <TrendingUp size={20} color="#15803D" />
                    </div>
                    <span className="stat-trend up">Net Profit</span>
                  </div>
                  <div className="stat-value text-green">₹{analytics.totalCompanyEarnings.toLocaleString('en-IN')}</div>
                  <div className="stat-label">Company Net Earnings (65%)</div>
                </div>
              </div>

              {/* Filters Box */}
              <div className="filter-card">
                <div className="filter-header">
                  <Filter size={16} />
                  <span>Filter Distributed Stock & Sales</span>
                </div>
                <div className="filter-grid">
                  <div className="filter-group">
                    <label>Employee / Agent</label>
                    <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
                      <option value="all">All Agents</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.full_name} ({a.agent_id_code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Product</label>
                    <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
                      <option value="all">All Products</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Request Status</label>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending Releases</option>
                      <option value="released">Released / Active</option>
                      <option value="completed">Fully Completed (Sold Out)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Reports Table */}
              <div className="table-wrap">
                {analytics.tableItems.length === 0 ? (
                  <div className="empty-row"><p>No sales or inventory distributions found matching these filters.</p></div>
                ) : (
                  <div className="table-container">
                    <table className="agents-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Product</th>
                          <th>Qty Taken</th>
                          <th>Qty Sold</th>
                          <th>Qty Returned</th>
                          <th>Remaining</th>
                          <th>Earnings (35%)</th>
                          <th>Company (65%)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.tableItems.map(item => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.agentName}</strong>
                              <div className="subtext">{item.agentCode}</div>
                            </td>
                            <td>{item.productName}</td>
                            <td className="center-val">{item.quantity}</td>
                            <td className="center-val text-green font-bold">{item.sold}</td>
                            <td className="center-val text-muted">{item.returned}</td>
                            <td className="center-val font-bold text-amber">{item.remaining}</td>
                            <td className="text-green font-bold">₹{item.commission.toLocaleString('en-IN')}</td>
                            <td className="text-blue font-bold">₹{item.companyRev.toLocaleString('en-IN')}</td>
                            <td>
                              <span className={`badge-pill ${item.status}`}>
                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. MANAGE CATALOG TAB */}
          {activeSubTab === 'catalog' && (
            <div className="tab-panel">
              <div className="panel-header-action">
                <div>
                  <h2 className="panel-title">Product Catalog</h2>
                  <p className="panel-desc">Define products that agents can collect from the warehouse and distribute.</p>
                </div>
                <button 
                  className="btn-add-product"
                  onClick={() => {
                    setEditingProduct(null);
                    setProdForm({ name: '', price: '', description: '' });
                    setShowCatalogModal(true);
                  }}
                >
                  <Plus size={16} />
                  <span>Add Product</span>
                </button>
              </div>

              {products.length === 0 ? (
                <div className="empty-panel">
                  <Package size={48} color="var(--text-sub)" />
                  <p>Catalog is empty. Add your first product to get started.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <div className="table-container">
                    <table className="agents-table">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th>Unit Price (INR)</th>
                          <th>Description</th>
                          <th style={{ width: 100 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map(prod => (
                          <tr key={prod.id}>
                            <td style={{ fontWeight: 600 }}>{prod.name}</td>
                            <td style={{ color: 'var(--accent)', fontWeight: 700 }}>
                              ₹{prod.price.toLocaleString('en-IN')}
                            </td>
                            <td>{prod.description || '—'}</td>
                            <td>
                              <div className="action-icons">
                                <button className="icon-btn-edit" onClick={() => handleEditProduct(prod)}>
                                  <Edit2 size={13} />
                                </button>
                                <button className="icon-btn-delete" onClick={() => handleDeleteProduct(prod.id)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Catalog Create/Edit Dialog Modal */}
      {showCatalogModal && (
        <div className="modal-overlay" onClick={() => setShowCatalogModal(false)}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
                <p className="modal-sub">Provide catalog parameters for agents</p>
              </div>
              <button className="modal-close" onClick={() => setShowCatalogModal(false)}><X size={14} /></button>
            </div>
            
            <form onSubmit={handleCatalogSubmit} className="modal-form">
              <div className="form-field">
                <label className="form-label">Product Name</label>
                <input 
                  type="text" 
                  className="form-input"
                  value={prodForm.name} 
                  onChange={e => setProdForm({ ...prodForm, name: e.target.value })} 
                  placeholder="e.g. Premium Noise-Cancelling Headphones"
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Unit Price (INR)</label>
                <input 
                  type="number" 
                  className="form-input"
                  value={prodForm.price} 
                  onChange={e => setProdForm({ ...prodForm, price: e.target.value })} 
                  placeholder="e.g. 1500"
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Description</label>
                <textarea 
                  className="feedback-textarea"
                  value={prodForm.description} 
                  onChange={e => setProdForm({ ...prodForm, description: e.target.value })} 
                  placeholder="Brief description of product features..."
                  rows={3}
                />
              </div>

              <div className="action-bar">
                <button type="submit" className="btn-approve" disabled={submittingProduct}>
                  {submittingProduct ? 'Saving…' : editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
                <button type="button" className="btn-cancel" onClick={() => setShowCatalogModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
