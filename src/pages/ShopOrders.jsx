import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { ClipboardList, Search, Clock, CheckCircle, XCircle, MapPin, Phone, User, ShoppingBag, ArrowRight } from 'lucide-react';
import { CreateTaskModal } from './Tasks';

const STATUS_FILTERS = ['all', 'pending', 'converted_to_task', 'cancelled'];

const STATUS_CONFIG = {
  pending: { label: 'Pending', className: 'badge-amber', icon: Clock },
  converted_to_task: { label: 'Converted to Task', className: 'badge-green', icon: CheckCircle },
  cancelled: { label: 'Cancelled', className: 'badge-red', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, className: 'badge-gray', icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`badge ${cfg.className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreateForOrder, setShowCreateForOrder] = useState(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopkeeper_orders')
        .select('*, agents(full_name, agent_id_code, mobile)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      let filtered = data || [];
      if (statusFilter !== 'all') {
        filtered = filtered.filter(o => o.status === statusFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(o =>
          (o.shopkeeper_name || '').toLowerCase().includes(q) ||
          (o.address || '').toLowerCase().includes(q) ||
          (o.agents?.full_name || '').toLowerCase().includes(q)
        );
      }

      setOrders(filtered);
      setTotal(filtered.length);
    } catch (err) {
      toast.error('Failed to load shopkeeper orders');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    loadOrders();
    const ch = supabase.channel('shop_orders_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopkeeper_orders' }, loadOrders)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadOrders]);

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    try {
      const { error } = await supabase
        .from('shopkeeper_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Order cancelled successfully');
      loadOrders();
    } catch (err) {
      toast.error('Failed to cancel order');
    }
  };

  const handleConvertToTask = (order) => {
    // Calculate total order value to calculate 35% commission
    const totalValue = order.items.reduce((acc, item) => acc + (Number(item.price) * Number(item.quantity)), 0);
    const commission = Math.round(totalValue * 0.35);

    // Format description with order item summary
    const itemSummary = order.items.map(item => `• ${item.name} (${item.quantity} units) @ ₹${item.price} each`).join('\n');
    const description = `Shopkeeper Order Delivery\n\nShopkeeper Details:\nName: ${order.shopkeeper_name}\nPhone: ${order.shopkeeper_phone || 'N/A'}\n\nOrder Items:\n${itemSummary}\n\nTotal Order Value: ₹${totalValue}\nCommission Reward (35%): ₹${commission}`;
    
    const instructions = `1. Collect the correct quantities of products from the warehouse.\n2. Proceed to the delivery address: ${order.address}.\n3. Hand over the items to the shopkeeper and collect payment (if cash-on-delivery).\n4. Take a photo of the delivery receipt or items with the shopkeeper as proof.\n5. Submit proof in the app to complete the task and claim your ₹${commission} commission.`;

    setShowCreateForOrder({
      orderId: order.id,
      initialForm: {
        title: `Order Delivery: ${order.shopkeeper_name}`,
        description,
        instructions,
        location_address: order.address,
        price: commission.toString(),
        category: 'Delivery',
        assigned_agent_id: order.agent_id || '', // Pre-select the agent who registered it
      }
    });
  };

  const handleTaskCreated = async (newTask) => {
    if (!showCreateForOrder || !newTask) return;
    try {
      const { error } = await supabase
        .from('shopkeeper_orders')
        .update({
          status: 'converted_to_task',
          task_id: newTask.id
        })
        .eq('id', showCreateForOrder.orderId);

      if (error) throw error;
      toast.success('Order successfully converted to task!');
      setShowCreateForOrder(null);
      loadOrders();
    } catch (err) {
      toast.error('Failed to link task to order');
    }
  };

  const orderStats = {
    pending: orders.filter(o => o.status === 'pending').length,
    converted: orders.filter(o => o.status === 'converted_to_task').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Shopkeeper Orders</h1>
          <p className="page-subtitle">{total} orders · Registered from the field</p>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid-3col" style={{ marginBottom: 24 }}>
        {[
          { label: 'Pending', value: orderStats.pending, color: '#D97706', bg: '#FEF3C7' },
          { label: 'Converted to Task', value: orderStats.converted, color: '#0A9B6A', bg: '#E8F5F0' },
          { label: 'Cancelled', value: orderStats.cancelled, color: '#DC2626', bg: '#FEE2E2' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="filter-tabs">
          {STATUS_FILTERS.map(s => (
            <button key={s} className={`filter-tab ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All Orders' : s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8FA89E' }} />
          <input
            className="search-input" style={{ paddingLeft: 36 }}
            placeholder="Search shop, address, agent…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="loading-spinner" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer / Shop</th>
                <th>Registered By</th>
                <th>Order Items</th>
                <th>Total Value</th>
                <th>Status</th>
                <th>Registered At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan="7" className="empty-cell">No orders found</td></tr>
              ) : orders.map(order => {
                const totalValue = order.items.reduce((acc, item) => acc + (Number(item.price) * Number(item.quantity)), 0);
                return (
                  <tr key={order.id}>
                    <td>
                      <div className="task-name" style={{ fontWeight: 600 }}>{order.shopkeeper_name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                        {order.shopkeeper_phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-sub)' }}>
                            <Phone size={10} />
                            <span>{order.shopkeeper_phone}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-sub)' }}>
                          <MapPin size={10} />
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 200 }}>
                            {order.address}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {order.agents ? (
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{order.agents.full_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{order.agents.agent_id_code}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {order.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                            {item.quantity}x {item.name}
                          </div>
                        ))}
                        {order.items.length > 2 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            + {order.items.length - 2} more items
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        ₹{totalValue.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Earn: ₹{Math.round(totalValue * 0.35).toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                      {new Date(order.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {order.status === 'pending' ? (
                          <>
                            <button
                              className="btn-approve-release"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12 }}
                              onClick={() => handleConvertToTask(order)}
                            >
                              Create Task <ArrowRight size={12} />
                            </button>
                            <button
                              className="btn-reject-outline"
                              style={{ padding: '6px 10px', fontSize: 12 }}
                              onClick={() => handleCancelOrder(order.id)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                            onClick={() => setSelectedOrder(order)}
                          >
                            Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Order Details</h2>
                <p className="modal-sub">{selectedOrder.shopkeeper_name}</p>
              </div>
              <button className="modal-close" onClick={() => setSelectedOrder(null)}><XCircle size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Delivery Address</p>
                <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{selectedOrder.address}</p>
              </div>

              {selectedOrder.shopkeeper_phone && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Phone Number</p>
                  <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{selectedOrder.shopkeeper_phone}</p>
                </div>
              )}

              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Order Items</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span>{item.name} <span style={{ color: 'var(--text-muted)' }}>x {item.quantity}</span></span>
                      <span style={{ fontWeight: 600 }}>₹{(Number(item.price) * Number(item.quantity)).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>Total Value:</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)' }}>
                  ₹{selectedOrder.items.reduce((acc, item) => acc + (Number(item.price) * Number(item.quantity)), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Task Modal Wrapper */}
      {showCreateForOrder && (
        <CreateTaskModal
          initialForm={showCreateForOrder.initialForm}
          onClose={() => setShowCreateForOrder(null)}
          onSuccess={handleTaskCreated}
        />
      )}
    </div>
  );
}
