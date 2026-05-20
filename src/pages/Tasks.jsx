import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';
import { Plus, Search, Filter, CheckCircle, XCircle, Clock, Eye, MapPin, DollarSign, User, Calendar, X } from 'lucide-react';

const STATUS_FILTERS = ['all', 'open', 'assigned', 'in_progress', 'under_review', 'completed', 'rejected'];

const STATUS_CONFIG = {
  open:         { label:'Open',         className:'badge-gray',  icon: Clock },
  assigned:     { label:'Assigned',     className:'badge-blue',  icon: User },
  in_progress:  { label:'In Progress',  className:'badge-blue',  icon: Activity },
  reached:      { label:'Reached',      className:'badge-blue',  icon: MapPin },
  under_review: { label:'Under Review', className:'badge-amber', icon: Eye },
  completed:    { label:'Completed',    className:'badge-green', icon: CheckCircle },
  rejected:     { label:'Rejected',     className:'badge-red',   icon: XCircle },
};

function Activity({ size, ...p }) { return <Clock size={size} {...p} />; }

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className={`badge ${cfg.className}`}>
      <span className="badge-dot" />
      {cfg.label}
    </span>
  );
}

export default function TasksPage() {
  const [tasks, setTasks]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery]   = useState('');
  const [isLoading, setIsLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewTask, setReviewTask] = useState(null);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: allTasks, error: taskErr } = await supabase
        .from('tasks').select('*').order('created_at', { ascending: false });
      const { data: allAssignments } = await supabase
        .from('task_assignments').select('*, agents(id, full_name, mobile, agent_id_code)');

      if (taskErr) throw taskErr;

      let combined = (allTasks || []).map(t => {
        const assignment = (allAssignments || []).find(a =>
          a.task_id === t.id &&
          ['accepted','assigned','reached','in_progress','proof_submitted','under_review','completed','approved'].includes(a.status)
        );
        let status = t.status;
        if (assignment) {
          if (assignment.status === 'proof_submitted') status = 'under_review';
          else if (assignment.status === 'approved')   status = 'completed';
          else if (assignment.status === 'accepted')   status = 'assigned';
          else status = assignment.status;
        }
        return {
          ...t,
          status,
          agent_name:    assignment?.agents?.full_name || null,
          agent_mobile:  assignment?.agents?.mobile || null,
          agent_id_code: assignment?.agents?.agent_id_code || null,
          agent_id:      assignment?.agent_id || null,
          proof_photos:  assignment?.proof_urls || [],
          proof_note:    assignment?.agent_note || '',
          assignment_id: assignment?.id || null,
        };
      });

      if (statusFilter !== 'all') combined = combined.filter(t => t.status === statusFilter);
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        combined = combined.filter(t =>
          (t.title||'').toLowerCase().includes(q) ||
          (t.agent_name||'').toLowerCase().includes(q) ||
          (t.address||'').toLowerCase().includes(q)
        );
      }

      setTasks(combined);
      setTotal(combined.length);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    loadTasks();
    const ch = supabase.channel('admin_tasks_rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'tasks' }, loadTasks)
      .on('postgres_changes', { event:'*', schema:'public', table:'task_assignments' }, loadTasks)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadTasks]);

  const handleApprove = async (task, feedback) => {
    try {
      await supabase.from('task_assignments').update({ status:'approved', admin_feedback: feedback }).eq('id', task.assignment_id);
      await supabase.from('tasks').update({ status:'completed' }).eq('id', task.id);
      const amt = Number(task.price || task.reward_amount || 0);
      await supabase.from('transactions').insert({ agent_id: task.agent_id, amount: amt, type:'task_reward', status:'completed' });
      const { data: ag } = await supabase.from('agents').select('wallet_balance').eq('id', task.agent_id).single();
      await supabase.from('agents').update({ wallet_balance: (ag?.wallet_balance || 0) + amt }).eq('id', task.agent_id);
      toast.success('Task approved — payment released');
      loadTasks(); setReviewTask(null);
    } catch { toast.error('Failed to approve task'); }
  };

  const handleReject = async (task, feedback) => {
    try {
      await supabase.from('task_assignments').update({ status:'rejected', admin_feedback: feedback }).eq('id', task.assignment_id);
      await supabase.from('tasks').update({ status:'open' }).eq('id', task.id);
      toast.success('Task proof rejected — reopened for reassignment');
      loadTasks(); setReviewTask(null);
    } catch { toast.error('Failed to reject task proof'); }
  };

  const taskStats = {
    open:         tasks.filter(t => t.status === 'open').length,
    assigned:     tasks.filter(t => ['assigned','in_progress','reached'].includes(t.status)).length,
    under_review: tasks.filter(t => t.status === 'under_review').length,
    completed:    tasks.filter(t => t.status === 'completed').length,
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Task Management</h1>
          <p className="page-subtitle">{total} tasks · Real-time pipeline management</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Create Task
        </button>
      </div>

      {/* Stats Strip */}
      <div className="grid-4col" style={{ marginBottom:24 }}>
        {[
          { label:'Open',        value: taskStats.open,         color:'#8FA89E', bg:'#F1F5F4' },
          { label:'In Progress', value: taskStats.assigned,     color:'#2563EB', bg:'#EFF6FF' },
          { label:'Under Review',value: taskStats.under_review, color:'#D97706', bg:'#FEF3C7' },
          { label:'Completed',   value: taskStats.completed,    color:'#0A9B6A', bg:'#E8F5F0' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border:`1px solid ${s.color}22`, borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:26, fontWeight:800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize:12, fontWeight:600, color: s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <div className="filter-tabs">
          {STATUS_FILTERS.map(s => (
            <button key={s} className={`filter-tab ${statusFilter===s?'active':''}`} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? 'All Tasks' : s.replace('_',' ').replace(/^\w/, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <div style={{ position:'relative' }}>
          <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#8FA89E' }} />
          <input
            className="search-input" style={{ paddingLeft:36 }}
            placeholder="Search tasks, agents…"
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
                <th>Task</th>
                <th>Assigned Employee</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan="6" className="empty-cell">No tasks match your filters</td></tr>
              ) : tasks.map(task => (
                <tr key={task.id}>
                  <td>
                    <div className="task-name">{task.title}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                      <MapPin size={11} color="#8FA89E" />
                      <span className="task-location">
                        {(task.address || '').split(' || ')[0] || task.location_address || '—'}
                        {task.address && task.address.includes(' || ') && (
                          <a href={task.address.split(' || ')[1]} target="_blank" rel="noopener noreferrer" style={{ marginLeft:6, color:'#0A9B6A', textDecoration:'none', fontWeight:600 }}>
                            (View Map)
                          </a>
                        )}
                      </span>
                    </div>
                  </td>
                  <td>
                    {task.agent_name ? (
                      <div>
                        <div className="agent-cell-name">{task.agent_name}</div>
                        <div className="agent-cell-id">{task.agent_id_code} · {task.agent_mobile}</div>
                      </div>
                    ) : (
                      <span style={{ fontSize:12, color:'#8FA89E', fontStyle:'italic', background:'#F1F5F4', padding:'3px 8px', borderRadius:6 }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <DollarSign size={13} color="#0A9B6A" />
                      <span className="price-cell">₹{Number(task.price || task.reward_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={task.status} /></td>
                  <td className="date-cell">{new Date(task.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</td>
                  <td>
                    {task.status === 'under_review' && (
                      <button className="btn-review" onClick={() => setReviewTask(task)}>
                        <Eye size={13} style={{ marginRight:4 }} />Review Proof
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); loadTasks(); }}
        />
      )}

      {reviewTask && (
        <ReviewTaskModal
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          onApprove={feedback => handleApprove(reviewTask, feedback)}
          onReject={feedback  => handleReject(reviewTask, feedback)}
        />
      )}
    </div>
  );
}

function CreateTaskModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '', description: '', instructions: '',
    location_link: '', location_address: '',
    price: '', category: '', deadline: '', assigned_agent_id: '',
  });
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase.from('agents').select('id, full_name, agent_id_code, city, state, mobile').eq('status','approved').order('full_name')
      .then(({ data }) => setAgents(data || []));
  }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    if (!form.price)         { toast.error('Task amount is required'); return; }
    setIsLoading(true);
    try {
      const finalDescription = form.instructions 
        ? `${form.description}\n\nInstructions:\n${form.instructions}` 
        : form.description;

      const finalAddress = form.location_link 
        ? `${form.location_address} || ${form.location_link}` 
        : form.location_address;

      let city = 'Mumbai';
      let state = 'Maharashtra';
      if (form.assigned_agent_id && selectedAgent) {
        if (selectedAgent.city) city = selectedAgent.city;
        if (selectedAgent.state) state = selectedAgent.state;
      }

      const { data: newTask, error } = await supabase.from('tasks').insert({
        title:         form.title.trim(),
        description:   finalDescription,
        address:       finalAddress,
        reward_amount: parseFloat(form.price),
        city,
        state,
        category:      form.category,
        deadline:      form.deadline ? new Date(form.deadline).toISOString() : null,
        status:        form.assigned_agent_id ? 'assigned' : 'open',
      }).select().single();

      if (error) throw error;

      // If agent selected, create task assignment
      if (form.assigned_agent_id && newTask) {
        await supabase.from('task_assignments').insert({
          task_id:     newTask.id,
          agent_id:    form.assigned_agent_id,
          status:      'accepted',
          assigned_at: new Date().toISOString(),
        });
      }

      toast.success(form.assigned_agent_id ? 'Task created and assigned to employee' : 'Task created and broadcast to all employees');
      onSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAgent = agents.find(a => a.id === form.assigned_agent_id);

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth:620, maxHeight:'92vh', overflowY:'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Create New Task</h2>
            <p className="modal-sub">Fill in the details and assign to an employee</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* Task Info */}
          <div style={{ background:'#F8FAFB', border:'1px solid #E2E8E6', borderRadius:10, padding:16, display:'flex', flexDirection:'column', gap:14 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#8FA89E', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Task Details</p>
            <div className="form-field">
              <label className="form-label">Task Title *</label>
              <input className="form-input" placeholder="e.g. Document Collection at Andheri" value={form.title} onChange={e => update('title', e.target.value)} required />
            </div>
            <div className="form-row">
              <div className="form-field">
                <label className="form-label">Amount (₹) *</label>
                <input className="form-input" type="number" min="1" placeholder="250" value={form.price} onChange={e => update('price', e.target.value)} required />
              </div>
              <div className="form-field">
                <label className="form-label">Category</label>
                <input className="form-input" placeholder="e.g. Verification" value={form.category} onChange={e => update('category', e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} value={form.description} onChange={e => update('description', e.target.value)} placeholder="Brief summary of the task…" />
            </div>
            <div className="form-field">
              <label className="form-label">Instructions for Employee</label>
              <textarea className="form-input" rows={2} value={form.instructions} onChange={e => update('instructions', e.target.value)} placeholder="Step-by-step instructions the employee must follow…" />
            </div>
            <div className="form-field">
              <label className="form-label">Deadline</label>
              <input className="form-input" type="datetime-local" value={form.deadline} onChange={e => update('deadline', e.target.value)} />
            </div>
          </div>

          {/* Location */}
          <div style={{ background:'#F8FAFB', border:'1px solid #E2E8E6', borderRadius:10, padding:16, display:'flex', flexDirection:'column', gap:14 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#8FA89E', letterSpacing:1, textTransform:'uppercase' }}>Location</p>
            <div className="form-field">
              <label className="form-label">Address</label>
              <input className="form-input" placeholder="Full address or landmark" value={form.location_address} onChange={e => update('location_address', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Location Link</label>
              <input className="form-input" placeholder="e.g. Google Maps URL or Link Provider" value={form.location_link} onChange={e => update('location_link', e.target.value)} />
            </div>
          </div>

          {/* Employee Assignment */}
          <div style={{ background:'#E8F5F0', border:'1px solid #B8E5D6', borderRadius:10, padding:16, display:'flex', flexDirection:'column', gap:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'#0A9B6A', letterSpacing:1, textTransform:'uppercase' }}>Assign Employee</p>
            <div className="form-field">
              <label className="form-label">Select Employee</label>
              <select className="form-input" value={form.assigned_agent_id} onChange={e => update('assigned_agent_id', e.target.value)} style={{ cursor:'pointer' }}>
                <option value="">-- Broadcast to all available employees --</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.full_name} ({a.agent_id_code}) · {a.city || 'N/A'}</option>
                ))}
              </select>
            </div>
            {selectedAgent ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', padding:'10px 14px', borderRadius:8, border:'1px solid #B8E5D6' }}>
                <div style={{ width:36, height:36, borderRadius:8, background:'#E8F5F0', border:'1px solid #B8E5D6', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#0A9B6A', fontSize:16 }}>
                  {selectedAgent.full_name?.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#0D1F1A' }}>{selectedAgent.full_name}</div>
                  <div style={{ fontSize:12, color:'#4B6358' }}>{selectedAgent.agent_id_code} · {selectedAgent.mobile}</div>
                </div>
                <span className="badge badge-green" style={{ marginLeft:'auto' }}>Selected</span>
              </div>
            ) : (
              <div style={{ fontSize:12, color:'#8FA89E', display:'flex', alignItems:'center', gap:6 }}>
                <User size={14} /> Task will be visible to all approved employees in the app
              </div>
            )}
          </div>

          <div className="modal-actions" style={{ paddingTop:8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating…' : (form.assigned_agent_id ? 'Create & Assign Task' : 'Create & Broadcast')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReviewTaskModal({ task, onClose, onApprove, onReject }) {
  const [feedback, setFeedback] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth:600, maxHeight:'92vh', overflowY:'auto' }}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Review Submitted Proof</h2>
            <p className="modal-sub">{task.title}</p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ padding:'20px 24px 24px' }}>
          {/* Employee info */}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'#F8FAFB', borderRadius:10, border:'1px solid #E2E8E6', marginBottom:20 }}>
            <div className="agent-avatar">{task.agent_name?.charAt(0)}</div>
            <div>
              <div className="agent-name">{task.agent_name}</div>
              <div className="agent-id">{task.agent_id_code} · {task.agent_mobile}</div>
            </div>
            <div style={{ marginLeft:'auto', textAlign:'right' }}>
              <div style={{ fontSize:12, color:'#8FA89E' }}>Task Value</div>
              <div style={{ fontWeight:800, fontSize:18, color:'#0A9B6A' }}>₹{Number(task.price || task.reward_amount || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>

          {/* Proof Photos */}
          {task.proof_photos?.length > 0 ? (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#8FA89E', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Submitted Proof Photos ({task.proof_photos.length})</div>
              <div className="grid-2col">
                {task.proof_photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`Proof ${i+1}`} style={{ width:'100%', height:160, objectFit:'cover', borderRadius:10, border:'1px solid #E2E8E6', cursor:'pointer' }} />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom:20, padding:'20px', background:'#F8FAFB', borderRadius:10, border:'2px dashed #E2E8E6', textAlign:'center', color:'#8FA89E', fontSize:13 }}>
              No photos submitted
            </div>
          )}

          {/* Agent note */}
          {task.proof_note && (
            <div style={{ marginBottom:20, padding:'14px 16px', background:'#E8F5F0', borderRadius:10, borderLeft:'3px solid #0A9B6A' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#0A9B6A', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Employee Note</div>
              <div style={{ fontSize:14, color:'#0D1F1A', lineHeight:1.6 }}>{task.proof_note}</div>
            </div>
          )}

          {/* Admin feedback */}
          <div className="form-field" style={{ marginBottom:20 }}>
            <label className="form-label">Admin Feedback (optional — sent to employee)</label>
            <textarea className="feedback-textarea" rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Add notes or instructions for the employee…" />
          </div>

          <div className="grid-2col">
            <button className="btn-danger" style={{ padding:'13px', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }} onClick={() => onReject(feedback)}>
              <XCircle size={16} /> Reject Proof
            </button>
            <button className="btn-success" style={{ padding:'13px', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }} onClick={() => onApprove(feedback)}>
              <CheckCircle size={16} /> Approve & Release Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
