import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { io } from 'socket.io-client';
import { locationAPI, agentAPI } from '../services/api';
import { formatCurrency } from '../utils/formatters';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 20.5937, lng: 78.9629 }; // India center

// Dot colors by status
const AGENT_DOT_COLORS = {
  online_idle: '#2ECC71',   // green — online, no active task
  on_task: '#2980B9',       // blue — on a task
  offline: '#7F8C8D',       // gray — offline
};

export default function LiveMapPage() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState(null);
  const socketRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    id: 'taskforce-map',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
  });

  useEffect(() => {
    loadLiveAgents();
    initSocket();
    const interval = setInterval(loadLiveAgents, 30000); // refresh every 30s

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, []);

  const loadLiveAgents = async () => {
    try {
      const { data } = await locationAPI.getLiveAgents();
      setAgents(data.agents);
    } catch (err) {
      console.error('Live agents error:', err);
    }
  };

  const initSocket = () => {
    const socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('admin:join', { adminId: 'admin' });
    });

    // Real-time location updates
    socket.on('agent:location', ({ agentId, lat, lng, timestamp }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, last_lat: lat, last_lng: lng, last_location_at: timestamp }
            : a
        )
      );
    });

    // Agent online status
    socket.on('agent:online_status', ({ agentId, is_online }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, is_online } : a
        )
      );
    });

    // Task status updates
    socket.on('task:accepted', ({ agentId, taskId }) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, active_task_id: taskId } : a
        )
      );
    });

    socketRef.current = socket;
  };

  const handleMarkerClick = async (agent) => {
    setSelectedAgent(agent);
    try {
      const { data } = await agentAPI.getById(agent.id);
      setSelectedAgentDetail(data);
    } catch (err) {
      setSelectedAgentDetail({ agent });
    }
  };

  const getAgentColor = (agent) => {
    if (!agent.is_online) return AGENT_DOT_COLORS.offline;
    if (agent.active_task_id) return AGENT_DOT_COLORS.on_task;
    return AGENT_DOT_COLORS.online_idle;
  };

  const onlineCount = agents.filter((a) => a.is_online).length;
  const onTaskCount = agents.filter((a) => a.active_task_id).length;

  if (!isLoaded) {
    return (
      <div className="live-map-loading">
        <div className="spinner" />
        <p>Loading map...</p>
      </div>
    );
  }

  return (
    <div className="live-map-container">
      {/* Stats Strip */}
      <div className="map-stats-strip">
        <StatChip color="#2ECC71" label="Online Agents" value={onlineCount} />
        <StatChip color="#2980B9" label="On Task" value={onTaskCount} />
        <StatChip color="#7F8C8D" label="Offline" value={agents.length - onlineCount} />
        <StatChip color="#1A1A2E" label="Total Agents" value={agents.length} />
      </div>

      {/* Legend */}
      <div className="map-legend">
        <LegendItem color="#2ECC71" label="Online & Idle" />
        <LegendItem color="#2980B9" label="On a Task" />
        <LegendItem color="#7F8C8D" label="Offline" />
      </div>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={5}
        options={{
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
        }}
      >
        {agents
          .filter((a) => a.last_lat && a.last_lng)
          .map((agent) => (
            <Marker
              key={agent.id}
              position={{ lat: parseFloat(agent.last_lat), lng: parseFloat(agent.last_lng) }}
              icon={{
                path: window.google?.maps?.SymbolPath?.CIRCLE,
                scale: 10,
                fillColor: getAgentColor(agent),
                fillOpacity: 1,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
              onClick={() => handleMarkerClick(agent)}
            />
          ))}

        {selectedAgent && selectedAgentDetail && (
          <InfoWindow
            position={{ lat: parseFloat(selectedAgent.last_lat), lng: parseFloat(selectedAgent.last_lng) }}
            onCloseClick={() => { setSelectedAgent(null); setSelectedAgentDetail(null); }}
          >
            <AgentInfoPanel agent={selectedAgent} detail={selectedAgentDetail} />
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

function AgentInfoPanel({ agent, detail }) {
  const { stats } = detail;

  return (
    <div className="agent-info-panel">
      <div className="agent-info-header">
        <div className="agent-avatar">{agent.full_name?.charAt(0)}</div>
        <div>
          <div className="agent-name">{agent.full_name}</div>
          <div className="agent-id">{agent.agent_id_code}</div>
        </div>
        <div className={`agent-status-dot ${agent.is_online ? 'online' : 'offline'}`} />
      </div>

      {agent.active_task_title && (
        <div className="agent-active-task">
          <span className="task-label">📋 Active Task:</span>
          <span className="task-name">{agent.active_task_title}</span>
        </div>
      )}

      <div className="agent-meta-row">
        <MetaItem label="Tasks Done" value={agent.total_tasks_completed || 0} />
        <MetaItem label="Today's Earnings" value={formatCurrency(stats?.total_earned)} />
      </div>

      <div className="agent-last-seen">
        Last seen: {agent.last_location_at
          ? new Date(agent.last_location_at).toLocaleTimeString('en-IN')
          : 'Unknown'}
      </div>
    </div>
  );
}

function StatChip({ color, label, value }) {
  return (
    <div className="stat-chip">
      <div className="stat-dot" style={{ background: color }} />
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div className="legend-item">
      <div className="legend-dot" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className="meta-item">
      <div className="meta-value">{value}</div>
      <div className="meta-label">{label}</div>
    </div>
  );
}

// Helper
function formatCurrencyHelper(amount) {
  if (!amount) return '₹0';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// Dark map style for a premium look
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6c757d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#16213e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f3460' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];
