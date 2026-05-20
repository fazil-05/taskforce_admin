import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { supabase } from '../services/supabase';
import { TrendingUp, TrendingDown, Users, CheckSquare, DollarSign, Activity, Award } from 'lucide-react';

const PIE_COLORS = ['#0A9B6A', '#D97706', '#DC2626', '#2563EB'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background:'#fff', border:'1px solid #E2E8E6', borderRadius:8, padding:'10px 14px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', fontSize:13 }}>
        <p style={{ fontWeight:600, color:'#0D1F1A', marginBottom:4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color, fontWeight:700 }}>{p.name}: {typeof p.value === 'number' && p.name?.includes('₹') ? `₹${p.value.toLocaleString('en-IN')}` : p.value}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [{ data: txs }, { data: tasks }, { data: assignments }, { data: agents }] = await Promise.all([
        supabase.from('transactions').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('task_assignments').select('*'),
        supabase.from('agents').select('*'),
      ]);

      let total_released = 0, total_pending = 0, total_cancelled = 0;
      (txs || []).forEach(tx => {
        const amt = Number(tx.amount || 0);
        if (tx.type === 'task_reward' || tx.type === 'withdrawal') {
          if (tx.status === 'completed' || tx.status === 'approved' || !tx.status) total_released += amt;
          else if (tx.status === 'pending') total_pending += amt;
          else if (tx.status === 'rejected' || tx.status === 'failed') total_cancelled += amt;
        }
      });
      (assignments || []).forEach(a => {
        if (a.status === 'proof_submitted') {
          const task = (tasks || []).find(t => t.id === a.task_id);
          if (task) total_pending += Number(task.price || task.reward_amount || 0);
        }
      });

      // Last 7 days task completions
      const completionMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        completionMap[d.toISOString().split('T')[0]] = 0;
      }
      (assignments || []).forEach(a => {
        if (['completed','approved','proof_submitted'].includes(a.status)) {
          const ds = new Date(a.completed_at || a.created_at || a.assigned_at).toISOString().split('T')[0];
          if (completionMap[ds] !== undefined) completionMap[ds]++;
        }
      });
      const completion_stats = Object.keys(completionMap).map(date => ({ date, 'Tasks Completed': completionMap[date] }));

      // Task status breakdown
      const taskStatusMap = { open:0, assigned:0, in_progress:0, under_review:0, completed:0, rejected:0 };
      (tasks || []).forEach(t => { if (taskStatusMap[t.status] !== undefined) taskStatusMap[t.status]++; });
      const task_status_data = Object.entries(taskStatusMap).map(([name, value]) => ({ name: name.replace('_',' '), value })).filter(d => d.value > 0);

      // User breakdown
      let approved = 0, pending = 0, rejected = 0;
      (agents || []).forEach(a => {
        if (a.status === 'approved') approved++;
        else if (a.status === 'pending') pending++;
        else rejected++;
      });
      const user_stats = [
        { name: 'Approved', value: approved },
        { name: 'Pending', value: pending },
        { name: 'Rejected', value: rejected },
      ].filter(u => u.value > 0);

      // Top agents
      const agentStats = {};
      (agents || []).forEach(a => {
        agentStats[a.id] = { ...a, total_tasks_completed: 0, total_earned: Number(a.wallet_balance || 0) };
      });
      (assignments || []).forEach(a => {
        if (['completed','approved'].includes(a.status) && agentStats[a.agent_id]) agentStats[a.agent_id].total_tasks_completed++;
      });
      const top_agents = Object.values(agentStats).sort((a, b) => b.total_tasks_completed - a.total_tasks_completed).slice(0, 10);

      // Monthly earnings trend (last 6 months)
      const monthMap = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        monthMap[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`] = 0;
      }
      (txs || []).forEach(tx => {
        if (tx.type === 'task_reward') {
          const key = tx.created_at?.slice(0, 7);
          if (monthMap[key] !== undefined) monthMap[key] += Number(tx.amount || 0);
        }
      });
      const earnings_trend = Object.entries(monthMap).map(([month, amount]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-IN', { month:'short', year:'2-digit' }),
        '₹ Earnings': amount,
      }));

      setData({ payout_stats: { total_released, total_pending, total_cancelled }, completion_stats, user_stats, top_agents, task_status_data, earnings_trend, agentCount: (agents||[]).length, taskCount: (tasks||[]).length });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    const ch = supabase.channel('analytics_rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'task_assignments' }, fetchAnalytics)
      .on('postgres_changes', { event:'*', schema:'public', table:'transactions' }, fetchAnalytics)
      .on('postgres_changes', { event:'*', schema:'public', table:'agents' }, fetchAnalytics)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchAnalytics]);

  if (isLoading) return <div style={{ padding:40 }}><div className="loading-spinner" /></div>;

  const { payout_stats, completion_stats, user_stats, top_agents, task_status_data, earnings_trend, agentCount, taskCount } = data || {};

  const KPI_CARDS = [
    { label:'Total Employees', value: agentCount || 0, icon: Users, color:'#0A9B6A', bg:'#E8F5F0', trend:'+12%', up:true },
    { label:'Active Tasks', value: taskCount || 0, icon: CheckSquare, color:'#2563EB', bg:'#EFF6FF', trend:'+8%', up:true },
    { label:'Released Earnings', value: `₹${Number(payout_stats?.total_released||0).toLocaleString('en-IN')}`, icon: DollarSign, color:'#0A9B6A', bg:'#E8F5F0', trend:'+23%', up:true },
    { label:'Pending Payouts', value: `₹${Number(payout_stats?.total_pending||0).toLocaleString('en-IN')}`, icon: Activity, color:'#D97706', bg:'#FEF3C7', trend:'-5%', up:false },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Dashboard</h1>
          <p className="page-subtitle">Real-time analytics and performance overview</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'#E8F5F0', borderRadius:8, border:'1px solid #B8E5D6' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#0A9B6A', display:'inline-block' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#0A9B6A' }}>Live Data</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid-4col" style={{ marginBottom:28 }}>
        {KPI_CARDS.map((kpi, i) => (
          <div key={i} className="stat-card">
            <div className="stat-header">
              <div className="stat-icon" style={{ background: kpi.bg }}>
                <kpi.icon size={20} color={kpi.color} />
              </div>
              <span className={`stat-trend ${kpi.up ? 'up' : 'down'}`} style={{ display:'flex', alignItems:'center', gap:3 }}>
                {kpi.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {kpi.trend}
              </span>
            </div>
            <div className="stat-value" style={{ color: kpi.color, fontSize:26 }}>{kpi.value}</div>
            <div className="stat-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid-2fr1fr" style={{ marginBottom:20 }}>
        <div className="chart-card">
          <div>
            <div className="chart-title">Monthly Earnings Trend</div>
            <div className="chart-subtitle">Revenue released to field employees</div>
          </div>
          <div style={{ marginTop:16 }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={earnings_trend || []} margin={{ top:5, right:10, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F0" />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#8FA89E' }} />
                <YAxis tick={{ fontSize:11, fill:'#8FA89E' }} tickFormatter={v => `₹${v.toLocaleString('en-IN')}`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="₹ Earnings" stroke="#0A9B6A" strokeWidth={2.5} dot={{ fill:'#0A9B6A', r:4 }} activeDot={{ r:6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Employee Status</div>
          <div className="chart-subtitle">Distribution by approval status</div>
          <div style={{ marginTop:16 }}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={user_stats||[]} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                  {(user_stats||[]).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ fontSize:12, color:'#4B6358' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid-2col" style={{ marginBottom:20 }}>
        <div className="chart-card">
          <div className="chart-title">Daily Task Completions</div>
          <div className="chart-subtitle">Last 7 days performance</div>
          <div style={{ marginTop:16 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={completion_stats||[]} margin={{ top:5, right:10, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F0" />
                <XAxis dataKey="date" tick={{ fontSize:10, fill:'#8FA89E' }} tickFormatter={d => new Date(d).toLocaleDateString('en-IN',{ day:'numeric', month:'short' })} />
                <YAxis tick={{ fontSize:11, fill:'#8FA89E' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Tasks Completed" fill="#0A9B6A" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Task Status Breakdown</div>
          <div className="chart-subtitle">Current task pipeline distribution</div>
          <div style={{ marginTop:16 }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={task_status_data||[]} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {(task_status_data||[]).map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Agents Leaderboard */}
      <div className="chart-card">
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <Award size={20} color="#0A9B6A" />
          <div>
            <div className="chart-title" style={{ marginBottom:0 }}>Top Performing Employees</div>
            <div className="chart-subtitle">Ranked by task completions</div>
          </div>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Employee</th>
                <th>ID Code</th>
                <th>Tasks Completed</th>
                <th>Wallet Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(top_agents||[]).length === 0 ? (
                <tr><td colSpan="6" className="empty-cell">No agent data available</td></tr>
              ) : (top_agents||[]).map((agent, i) => (
                <tr key={agent.id}>
                  <td className="rank-cell">
                    <span style={{ fontWeight:800, color: i===0?'#D97706':i===1?'#8FA89E':i===2?'#D97706':'#4B6358', fontSize:14 }}>
                      #{i+1}
                    </span>
                  </td>
                  <td>
                    <div className="agent-name-cell">
                      <div className="agent-avatar">{agent.full_name?.charAt(0)}</div>
                      <div className="agent-name">{agent.full_name}</div>
                    </div>
                  </td>
                  <td className="agent-id">{agent.agent_id_code || '—'}</td>
                  <td className="center">
                    <span style={{ fontWeight:700, color:'#0A9B6A' }}>{agent.total_tasks_completed}</span>
                  </td>
                  <td style={{ fontWeight:700 }}>₹{Number(agent.total_earned||0).toLocaleString('en-IN')}</td>
                  <td>
                    <span className={`badge ${agent.status==='approved'?'badge-green':agent.status==='pending'?'badge-amber':'badge-red'}`}>
                      <span className="badge-dot" />
                      {agent.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
