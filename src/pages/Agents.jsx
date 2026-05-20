import React, { useState, useEffect, useCallback } from 'react';
import { agentAPI } from '../services/api';
import toast from 'react-hot-toast';

const VERIFICATION_FILTERS = ['all', 'pending', 'under_review', 'approved', 'rejected', 'suspended'];

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;
      const { data } = await agentAPI.getAll(params);
      setAgents(data.agents);
      setTotal(data.total);
    } catch (err) {
      toast.error('Failed to load agents');
    } finally {
      setIsLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const handleApprove = async (agentId) => {
    try {
      await agentAPI.approve(agentId);
      toast.success('Agent approved!');
      loadAgents();
      setSelectedAgent(null);
    } catch (err) {
      toast.error('Failed to approve agent');
    }
  };

  const handleReject = async (agentId) => {
    const reason = window.prompt('Rejection reason (optional):');
    try {
      await agentAPI.reject(agentId, reason);
      toast.success('Agent rejected.');
      loadAgents();
      setSelectedAgent(null);
    } catch (err) {
      toast.error('Failed to reject agent');
    }
  };

  const handleSuspend = async (agentId) => {
    if (!window.confirm('Suspend this agent? They will lose access immediately.')) return;
    try {
      await agentAPI.suspend(agentId);
      toast.success('Agent suspended.');
      loadAgents();
      setSelectedAgent(null);
    } catch (err) {
      toast.error('Failed to suspend agent');
    }
  };

  const handleVerifyAadhaar = async (agentId, action) => {
    const reason = action === 'reject' ? window.prompt('Rejection reason:') : null;
    try {
      await agentAPI.verifyAadhaar(agentId, action, reason);
      toast.success(`Aadhaar ${action === 'approve' ? 'verified' : 'rejected'}!`);
      loadAgents();
    } catch (err) {
      toast.error('Failed to update Aadhaar verification');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agent Management</h1>
          <p className="page-subtitle">{total} registered agents</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="search-filter-row">
        <input
          className="search-input"
          placeholder="Search by name or mobile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {VERIFICATION_FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="loading-spinner" />
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Mobile</th>
                <th>City</th>
                <th>Status</th>
                <th>Aadhaar</th>
                <th>Tasks Done</th>
                <th>Online</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr><td colSpan="8" className="empty-cell">No agents found</td></tr>
              ) : agents.map((agent) => (
                <tr key={agent.id} onClick={() => setSelectedAgent(agent)} className="clickable-row">
                  <td>
                    <div className="agent-cell-main">
                      <div className="agent-avatar-small">{agent.full_name?.charAt(0)}</div>
                      <div>
                        <div className="agent-cell-name">{agent.full_name}</div>
                        <div className="agent-cell-id">{agent.agent_id_code}</div>
                      </div>
                    </div>
                  </td>
                  <td>{agent.mobile}</td>
                  <td>{agent.city}, {agent.state}</td>
                  <td><StatusBadge status={agent.status} /></td>
                  <td><StatusBadge status={agent.aadhaar_status || 'pending'} type="aadhaar" /></td>
                  <td className="center">{agent.total_tasks_completed}</td>
                  <td className="center">
                    <div className={`online-dot ${agent.is_online ? 'online' : 'offline'}`} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      {agent.status === 'under_review' && (
                        <>
                          <button className="btn-xs btn-success" onClick={() => handleApprove(agent.id)}>Approve</button>
                          <button className="btn-xs btn-danger" onClick={() => handleReject(agent.id)}>Reject</button>
                        </>
                      )}
                      {agent.status === 'approved' && (
                        <button className="btn-xs btn-warning" onClick={() => handleSuspend(agent.id)}>Suspend</button>
                      )}
                      {agent.aadhaar_status === 'pending' && (
                        <>
                          <button className="btn-xs btn-success" onClick={() => handleVerifyAadhaar(agent.id, 'approve')}>✓ KYC</button>
                          <button className="btn-xs btn-danger" onClick={() => handleVerifyAadhaar(agent.id, 'reject')}>✕ KYC</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent Detail Side Panel */}
      {selectedAgent && (
        <AgentDetailPanel
          agentId={selectedAgent.id}
          onClose={() => setSelectedAgent(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onSuspend={handleSuspend}
        />
      )}
    </div>
  );
}

function AgentDetailPanel({ agentId, onClose, onApprove, onReject, onSuspend }) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    agentAPI.getById(agentId).then(({ data }) => {
      setDetail(data);
      setIsLoading(false);
    });
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="side-panel">
        <div className="loading-spinner" />
      </div>
    );
  }

  const { agent, stats } = detail;

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>Agent Profile</h2>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>

      <div className="agent-detail-body">
        <div className="agent-profile-top">
          <div className="agent-avatar-lg">{agent.full_name?.charAt(0)}</div>
          <div>
            <div className="agent-detail-name">{agent.full_name}</div>
            <div className="agent-detail-id">{agent.agent_id_code}</div>
            <StatusBadge status={agent.status} />
          </div>
        </div>

        <div className="detail-section">
          <h4>Personal Info</h4>
          <DetailRow label="Mobile" value={agent.mobile} />
          <DetailRow label="Email" value={agent.email} />
          <DetailRow label="City" value={`${agent.city}, ${agent.state}`} />
        </div>

        <div className="detail-section">
          <h4>KYC</h4>
          <DetailRow label="Aadhaar" value={agent.aadhaar_number_masked} />
          <DetailRow label="Verification" value={agent.aadhaar_status} />
        </div>

        <div className="detail-section">
          <h4>Performance</h4>
          <DetailRow label="Tasks Completed" value={stats?.completed || 0} />
          <DetailRow label="Tasks Rejected" value={stats?.rejected || 0} />
          <DetailRow label="Total Earned" value={`₹${parseFloat(stats?.total_earned || 0).toLocaleString('en-IN')}`} />
        </div>

        <div className="panel-actions">
          {agent.status === 'under_review' && (
            <>
              <button className="btn-success btn-full" onClick={() => onApprove(agent.id)}>✓ Approve Agent</button>
              <button className="btn-danger btn-full" onClick={() => onReject(agent.id)}>✕ Reject Agent</button>
            </>
          )}
          {agent.status === 'approved' && (
            <button className="btn-warning btn-full" onClick={() => onSuspend(agent.id)}>⚠ Suspend Agent</button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, type }) {
  const colors = {
    approved: 'badge-green',
    verified: 'badge-green',
    under_review: 'badge-amber',
    pending: 'badge-amber',
    rejected: 'badge-red',
    suspended: 'badge-red',
  };
  return <span className={`badge ${colors[status] || 'badge-gray'}`}>{status?.replace('_', ' ')}</span>;
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || '—'}</span>
    </div>
  );
}
