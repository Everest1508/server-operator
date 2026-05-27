import { useEffect, useRef, useState } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Network, 
  Play, 
  Pause, 
  RefreshCw, 
  AlertTriangle, 
  Activity, 
  Server as ServerIcon,
  Wifi,
  WifiOff,
  Bell,
  Trash2,
  Sliders,
  CheckCircle,
  Database,
  LineChart,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { ServerConnection, ProxySettings } from '../types';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Filler,
  Legend
} from 'chart.js';

// Register Chart.js components
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Tooltip,
  Filler,
  Legend
);

interface ServerMonitoringViewProps {
  currentServer: ServerConnection;
  proxy: ProxySettings;
}

interface RawNetworkStats {
  rx: number;
  tx: number;
  time: number;
}

interface RawDiskStats {
  readSectors: number;
  writeSectors: number;
  time: number;
}

interface MetricHistoryPoint {
  timeLabel: string;
  cpu: number;
  memPercent: number;
  memUsedGB: number;
  memTotalGB: number;
  diskReadKB: number;
  diskWriteKB: number;
  netDownKB: number;
  netUpKB: number;
  diskPercent: number;
}

interface AlertsConfig {
  cpuThreshold: number;
  diskThreshold: number;
  ramThreshold: number;
  desktopNotifications: boolean;
  webhooksEnabled: boolean;
  webhookUrl: string;
}

interface AlertLog {
  id: number;
  serverId: string;
  serverName: string;
  metricType: 'CPU' | 'RAM' | 'DISK';
  metricValue: number;
  thresholdValue: number;
  message: string;
  timestamp: string;
}

const DEFAULT_CONFIG: AlertsConfig = {
  cpuThreshold: 80,
  diskThreshold: 90,
  ramThreshold: 90,
  desktopNotifications: true,
  webhooksEnabled: false,
  webhookUrl: '',
};

export function ServerMonitoringView({ currentServer, proxy }: ServerMonitoringViewProps) {
  // Navigation tabs
  const [monitorSubTab, setMonitorSubTab] = useState<'dashboard' | 'resource-history' | 'history' | 'settings'>('dashboard');

  // Historical Resource Usage tab states
  const [historyWindow, setHistoryWindow] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historicalData, setHistoricalData] = useState<Array<{ cpu: number; ram: number; disk: number; timestamp: string }>>([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalError, setHistoricalError] = useState<string | null>(null);
  
  const historicalCanvasRef = useRef<HTMLCanvasElement>(null);
  const historicalChartRef = useRef<Chart | null>(null);

  // Control state
  const [isPlaying, setIsPlaying] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(2000); // 2 seconds
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Settings configuration state
  const [alertConfig, setAlertConfig] = useState<AlertsConfig>(DEFAULT_CONFIG);
  const [settingsSavedMessage, setSettingsSavedMessage] = useState(false);

  // Alert history state
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [dataReceived, setDataReceived] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [pollingFailed, setPollingFailed] = useState(false);

  // Current metric values for UI indicators
  const [metrics, setMetrics] = useState<MetricHistoryPoint>({
    timeLabel: '',
    cpu: 0,
    memPercent: 0,
    memUsedGB: 0,
    memTotalGB: 0,
    diskReadKB: 0,
    diskWriteKB: 0,
    netDownKB: 0,
    netUpKB: 0,
    diskPercent: 0,
  });

  // Uptime monitoring state
  const [latencyHistory, setLatencyHistory] = useState<Array<{ timestamp: string; latency: number }>>([]);
  const [servicesStatus, setServicesStatus] = useState<Record<string, 'up' | 'down'>>({});
  const [overallStatus, setOverallStatus] = useState<'green' | 'yellow' | 'red' | 'gray'>('gray');
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  // Chart canvas element references
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const ramCanvasRef = useRef<HTMLCanvasElement>(null);
  const diskCanvasRef = useRef<HTMLCanvasElement>(null);
  const netCanvasRef = useRef<HTMLCanvasElement>(null);
  const latencyCanvasRef = useRef<HTMLCanvasElement>(null);

  // Chart instances
  const cpuChart = useRef<Chart | null>(null);
  const ramChart = useRef<Chart | null>(null);
  const diskChart = useRef<Chart | null>(null);
  const netChart = useRef<Chart | null>(null);
  const latencyChart = useRef<Chart | null>(null);

  // Polling logic state
  const isDummyServer = currentServer.id === 'dummy' || currentServer.host === 'dummy';
  const prevNetRef = useRef<RawNetworkStats | null>(null);
  const prevDiskRef = useRef<RawDiskStats | null>(null);
  const historyRef = useRef<MetricHistoryPoint[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAlertTimes = useRef<Record<string, number>>({});

  useEffect(() => {
    setShowSkeleton(true);
    setDataReceived(false);
    setPollingFailed(false);
    
    const skeletonTimer = setTimeout(() => {
      setShowSkeleton(false);
    }, 3000);

    const failTimer = setTimeout(() => {
      setDataReceived((current) => {
        if (!current) {
          setPollingFailed(true);
        }
        return current;
      });
    }, 10000);

    return () => {
      clearTimeout(skeletonTimer);
      clearTimeout(failTimer);
    };
  }, [currentServer.id]);

  // 1. Load alerts config on server change
  useEffect(() => {
    const configKey = `server-operator:alerts-config:${currentServer.id}`;
    const raw = localStorage.getItem(configKey);
    if (raw) {
      try {
        setAlertConfig(JSON.parse(raw));
      } catch {
        setAlertConfig(DEFAULT_CONFIG);
      }
    } else {
      setAlertConfig(DEFAULT_CONFIG);
    }
    // Reset alert tracking times when changing server
    lastAlertTimes.current = {};
    historyRef.current = [];
  }, [currentServer.id]);

  // 2. Fetch alert log history from SQLite
  const fetchAlertHistory = async () => {
    if (!window.serverOperator) return;
    try {
      const logs = await window.serverOperator.getAlertHistory({ serverId: currentServer.id });
      setAlertLogs(logs || []);
    } catch (err) {
      console.error('Error fetching alert logs:', err);
    }
  };

  useEffect(() => {
    if (monitorSubTab === 'history') {
      fetchAlertHistory();
    }
  }, [monitorSubTab, currentServer.id]);

  const fetchHistoricalData = async (useDates = false) => {
    if (!window.serverOperator) return;
    setHistoricalLoading(true);
    setHistoricalError(null);
    try {
      const opts: { serverId: string; timeWindow?: '1h' | '6h' | '24h' | '7d'; startDate?: string; endDate?: string } = {
        serverId: currentServer.id,
      };
      if (useDates) {
        if (!historyStartDate) {
          throw new Error('Please select a start date');
        }
        opts.startDate = new Date(historyStartDate).toISOString();
        if (historyEndDate) {
          opts.endDate = new Date(historyEndDate).toISOString();
        }
      } else {
        opts.timeWindow = historyWindow;
      }
      const data = await window.serverOperator.getHistoricalMetrics(opts);
      setHistoricalData(data || []);
    } catch (err: any) {
      console.error('Error fetching historical metrics:', err);
      setHistoricalError(err.message || 'Failed to fetch historical metrics');
    } finally {
      setHistoricalLoading(false);
    }
  };

  useEffect(() => {
    if (monitorSubTab === 'resource-history') {
      fetchHistoricalData(false);
    }
  }, [monitorSubTab, currentServer.id, historyWindow]);

  useEffect(() => {
    if (monitorSubTab !== 'resource-history' || !historicalCanvasRef.current) return;

    const ctx = historicalCanvasRef.current;
    
    if (historicalChartRef.current) {
      historicalChartRef.current.destroy();
    }

    const hasMultiDay = (() => {
      if (historicalData.length < 2) return false;
      const first = new Date(historicalData[0].timestamp).getTime();
      const last = new Date(historicalData[historicalData.length - 1].timestamp).getTime();
      return (last - first) > 24 * 60 * 60 * 1000;
    })();

    const labels = historicalData.map(d => {
      try {
        const date = new Date(d.timestamp);
        if (hasMultiDay) {
          const month = date.toLocaleString([], { month: 'short' });
          const day = date.getDate();
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          return `${month} ${day} ${timeStr}`;
        } else {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } catch (_) {
        return '';
      }
    });

    historicalChartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU (%)',
            data: historicalData.map(d => d.cpu),
            borderColor: '#4ec9b0',
            backgroundColor: 'rgba(78, 201, 176, 0.05)',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: historicalData.length > 100 ? 0 : 1,
            pointHoverRadius: 4,
            fill: true
          },
          {
            label: 'RAM (%)',
            data: historicalData.map(d => d.ram),
            borderColor: '#0078d4',
            backgroundColor: 'rgba(0, 120, 212, 0.05)',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: historicalData.length > 100 ? 0 : 1,
            pointHoverRadius: 4,
            fill: true
          },
          {
            label: 'Disk (%)',
            data: historicalData.map(d => d.disk),
            borderColor: '#dcdcaa',
            backgroundColor: 'rgba(220, 220, 170, 0.05)',
            borderWidth: 1.5,
            tension: 0.2,
            pointRadius: historicalData.length > 100 ? 0 : 1,
            pointHoverRadius: 4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#cccccc',
              boxWidth: 12,
              font: { family: 'JetBrains Mono, Fira Code, monospace', size: 10 }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#252526',
            titleColor: '#cccccc',
            bodyColor: '#cccccc',
            borderColor: '#3c3c3c',
            borderWidth: 1,
            titleFont: { family: 'JetBrains Mono, Fira Code, monospace', size: 11 },
            bodyFont: { family: 'JetBrains Mono, Fira Code, monospace', size: 10 }
          }
        },
        scales: {
          x: {
            grid: { color: '#3c3c3c' },
            ticks: {
              color: '#858585',
              maxTicksLimit: 7,
              autoSkip: true,
              font: { family: 'JetBrains Mono, Fira Code, monospace', size: 9 }
            }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: '#3c3c3c' },
            ticks: {
              color: '#858585',
              font: { family: 'JetBrains Mono, Fira Code, monospace', size: 9 },
              callback: (val: any) => `${val}%`
            }
          }
        }
      }
    });

    return () => {
      if (historicalChartRef.current) {
        historicalChartRef.current.destroy();
        historicalChartRef.current = null;
      }
    };
  }, [historicalData, monitorSubTab]);

  const exportToCSV = () => {
    if (historicalData.length === 0) {
      alert('No data points to export.');
      return;
    }
    let csvContent = 'Timestamp,CPU (%),RAM (%),Disk (%)\n';
    for (const d of historicalData) {
      const timeStr = new Date(d.timestamp).toLocaleString().replace(/,/g, '');
      csvContent += `${timeStr},${d.cpu},${d.ram},${d.disk}\n`;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const sanitizedServerName = currentServer.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `${sanitizedServerName}_resource_history_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearHistoricalMetrics = async () => {
    if (!window.serverOperator) return;
    const ok = window.confirm(
      `WARNING: All historical CPU, RAM, and Disk metrics data for ${currentServer.name} will be permanently deleted from SQLite.\n\nDo you want to proceed?`
    );
    if (!ok) return;
    try {
      const res = await window.serverOperator.clearHistoricalMetrics({ serverId: currentServer.id });
      if (res.ok) {
        setHistoricalData([]);
        alert('Historical resource usage metrics cleared successfully.');
      } else {
        alert(res.error || 'Failed to clear historical metrics.');
      }
    } catch (err) {
      console.error('Error clearing historical metrics:', err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    const updateFromStatuses = (list: any[]) => {
      const entry = list.find((item: any) => item.serverId === currentServer.id);
      if (entry) {
        setLatencyHistory(entry.latencyHistory || []);
        setServicesStatus(entry.services || {});
        setOverallStatus(entry.status || 'gray');
        setLastCheckedTime(entry.lastChecked || null);
      } else {
        setLatencyHistory([]);
        setServicesStatus({});
        setOverallStatus('gray');
        setLastCheckedTime(null);
      }
    };

    if (window.serverOperator && window.serverOperator.getMonitoredServersStatus) {
      window.serverOperator.getMonitoredServersStatus().then((list) => {
        if (isMounted) {
          updateFromStatuses(list);
        }
      }).catch(err => {
        console.error('Error fetching monitored status in ServerMonitoringView:', err);
      });
    }

    const handleUpdate = (e: Event) => {
      const list = (e as CustomEvent).detail;
      if (Array.isArray(list) && isMounted) {
        updateFromStatuses(list);
      }
    };

    window.addEventListener('monitored-servers-status-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('monitored-servers-status-updated', handleUpdate);
    };
  }, [currentServer.id]);

  // Save config settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const configKey = `server-operator:alerts-config:${currentServer.id}`;
    localStorage.setItem(configKey, JSON.stringify(alertConfig));
    setSettingsSavedMessage(true);
    setTimeout(() => setSettingsSavedMessage(false), 3000);
  };

  // Clear alert log history in SQLite
  const handleClearAlertHistory = async () => {
    if (!window.serverOperator) return;
    const ok = window.confirm(
      "WARNING: All old alert notification logs will be deleted permanently. This action cannot be undone.\n\nDo you want to continue?"
    );
    if (!ok) return;
    try {
      const res = await window.serverOperator.clearAlertHistory({ serverId: currentServer.id });
      if (res.ok) {
        setAlertLogs([]);
        alert("Alert notification history has been permanently deleted.");
      } else {
        alert(res.error || 'Failed to clear alert history');
      }
    } catch (err) {
      console.error('Error clearing alert logs:', err);
    }
  };

  // Threshold alert checking logic
  const checkAlertThresholds = async (
    cpuVal: number,
    memPercentVal: number,
    diskPercentVal: number,
    config: AlertsConfig
  ) => {
    const now = Date.now();
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown

    const checkMetric = async (
      type: 'CPU' | 'RAM' | 'DISK',
      value: number,
      limit: number,
      message: string
    ) => {
      const cooldownKey = `${currentServer.id}_${type}`;
      if (value > limit) {
        const lastTriggered = lastAlertTimes.current[cooldownKey] || 0;
        if (now - lastTriggered > cooldownMs) {
          lastAlertTimes.current[cooldownKey] = now;
          
          // 1. Save to SQLite
          try {
            await window.serverOperator.saveAlert({
              serverId: currentServer.id,
              serverName: currentServer.name,
              metricType: type,
              metricValue: value,
              thresholdValue: limit,
              message,
              timestamp: new Date().toISOString()
            });
          } catch (err) {
            console.error('Failed to save alert in database:', err);
          }

          // 2. Desktop Notification
          if (config.desktopNotifications) {
            try {
              await window.serverOperator.triggerNotification({
                title: `Server Operator: Alert on ${currentServer.name}`,
                body: message
              });
            } catch (err) {
              console.error('Failed to send desktop notification:', err);
            }
          }

          // 3. Webhook HTTP POST
          if (config.webhooksEnabled && config.webhookUrl.trim()) {
            try {
              await window.serverOperator.sendWebhook({
                url: config.webhookUrl.trim(),
                payload: {
                  event: 'server_metric_alert',
                  serverId: currentServer.id,
                  serverName: currentServer.name,
                  metricType: type,
                  metricValue: value,
                  thresholdValue: limit,
                  message,
                  timestamp: new Date().toISOString()
                }
              });
            } catch (err) {
              console.error('Failed to post webhook:', err);
            }
          }
        }
      } else if (value < limit - 5) {
        // Reset cooldown once value drops below threshold with 5% hysteresis
        lastAlertTimes.current[cooldownKey] = 0;
      }
    };

    await checkMetric('CPU', cpuVal, config.cpuThreshold, `CPU utilization exceeded limit: ${cpuVal}% (Limit: ${config.cpuThreshold}%)`);
    await checkMetric('RAM', memPercentVal, config.ramThreshold, `RAM utilization is critically high: ${memPercentVal.toFixed(1)}% (Limit: ${config.ramThreshold}%)`);
    await checkMetric('DISK', diskPercentVal, config.diskThreshold, `Disk storage consumption is critical: ${diskPercentVal}% (Limit: ${config.diskThreshold}%)`);
  };

  // Initialize charts once refs are ready
  useEffect(() => {
    if (monitorSubTab !== 'dashboard') return;

    const chartOptions = (yMax?: number, yLabel = '%') => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 }, // Disable animations for real-time performance
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: '#cccccc',
            boxWidth: 12,
            font: { family: 'JetBrains Mono, Fira Code, monospace', size: 10 }
          }
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: '#252526',
          titleColor: '#cccccc',
          bodyColor: '#cccccc',
          borderColor: '#3c3c3c',
          borderWidth: 1,
          titleFont: { family: 'JetBrains Mono, Fira Code, monospace', size: 11 },
          bodyFont: { family: 'JetBrains Mono, Fira Code, monospace', size: 10 }
        }
      },
      scales: {
        x: {
          grid: { color: '#3c3c3c' },
          ticks: {
            color: '#858585',
            maxRotation: 0,
            font: { family: 'JetBrains Mono, Fira Code, monospace', size: 9 }
          }
        },
        y: {
          min: 0,
          max: yMax,
          grid: { color: '#3c3c3c' },
          ticks: {
            color: '#858585',
            font: { family: 'JetBrains Mono, Fira Code, monospace', size: 9 },
            callback: (val: any) => `${val}${yLabel ? ' ' + yLabel : ''}`
          }
        }
      }
    });

    // 1. CPU Chart
    if (cpuCanvasRef.current) {
      if (cpuChart.current) cpuChart.current.destroy();
      cpuChart.current = new Chart(cpuCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'CPU Usage',
            data: [],
            borderColor: '#4ec9b0',
            backgroundColor: 'rgba(78, 201, 176, 0.1)',
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 4,
          }]
        },
        options: chartOptions(100, '%')
      });
    }

    // 2. RAM Chart
    if (ramCanvasRef.current) {
      if (ramChart.current) ramChart.current.destroy();
      ramChart.current = new Chart(ramCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'RAM Usage',
              data: [],
              borderColor: '#0078d4',
              backgroundColor: 'rgba(0, 120, 212, 0.1)',
              borderWidth: 1.5,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            }
          ]
        },
        options: chartOptions(100, '%')
      });
    }

    // 3. Disk I/O Chart
    if (diskCanvasRef.current) {
      if (diskChart.current) diskChart.current.destroy();
      diskChart.current = new Chart(diskCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Read',
              data: [],
              borderColor: '#dcdcaa',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            },
            {
              label: 'Write',
              data: [],
              borderColor: '#f14c4c',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            }
          ]
        },
        options: chartOptions(undefined, 'KB/s')
      });
    }

    // 4. Network Chart
    if (netCanvasRef.current) {
      if (netChart.current) netChart.current.destroy();
      netChart.current = new Chart(netCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Download (Rx)',
              data: [],
              borderColor: '#4ec9b0',
              backgroundColor: 'rgba(78, 201, 176, 0.05)',
              borderWidth: 1.5,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            },
            {
              label: 'Upload (Tx)',
              data: [],
              borderColor: '#3794ff',
              backgroundColor: 'rgba(55, 148, 255, 0.05)',
              borderWidth: 1.5,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            }
          ]
        },
        options: chartOptions(undefined, 'KB/s')
      });
    }

    // 5. Latency Chart
    if (latencyCanvasRef.current) {
      if (latencyChart.current) latencyChart.current.destroy();
      latencyChart.current = new Chart(latencyCanvasRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'SSH Response Time (Latency)',
              data: [],
              borderColor: '#f14c4c',
              backgroundColor: 'rgba(241, 76, 76, 0.1)',
              borderWidth: 1.5,
              fill: true,
              tension: 0.3,
              pointRadius: 3,
              pointHoverRadius: 5,
            }
          ]
        },
        options: chartOptions(undefined, 'ms')
      });
    }

    // Populate charts immediately with existing historyRef data
    updateCharts(historyRef.current);

    return () => {
      cpuChart.current?.destroy();
      ramChart.current?.destroy();
      diskChart.current?.destroy();
      netChart.current?.destroy();
      latencyChart.current?.destroy();
      cpuChart.current = null;
      ramChart.current = null;
      diskChart.current = null;
      netChart.current = null;
      latencyChart.current = null;
    };
  }, [monitorSubTab, currentServer.id]);

  useEffect(() => {
    if (monitorSubTab !== 'dashboard' || !latencyChart.current) return;
    
    const labels = latencyHistory.map(h => {
      try {
        const d = new Date(h.timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (_) {
        return '';
      }
    });
    const dataPoints = latencyHistory.map(h => h.latency);

    latencyChart.current.data.labels = labels;
    latencyChart.current.data.datasets[0].data = dataPoints;
    latencyChart.current.update('none');
  }, [latencyHistory, monitorSubTab]);

  // Update charts with history data
  const updateCharts = (history: MetricHistoryPoint[]) => {
    const labels = history.map(h => h.timeLabel);

    if (cpuChart.current) {
      cpuChart.current.data.labels = labels;
      cpuChart.current.data.datasets[0].data = history.map(h => h.cpu);
      cpuChart.current.update('none');
    }

    if (ramChart.current) {
      ramChart.current.data.labels = labels;
      ramChart.current.data.datasets[0].data = history.map(h => h.memPercent);
      ramChart.current.update('none');
    }

    if (diskChart.current) {
      diskChart.current.data.labels = labels;
      diskChart.current.data.datasets[0].data = history.map(h => h.diskReadKB);
      diskChart.current.data.datasets[1].data = history.map(h => h.diskWriteKB);
      diskChart.current.update('none');
    }

    if (netChart.current) {
      netChart.current.data.labels = labels;
      netChart.current.data.datasets[0].data = history.map(h => h.netDownKB);
      netChart.current.data.datasets[1].data = history.map(h => h.netUpKB);
      netChart.current.update('none');
    }
  };

  // Poll server metrics
  const fetchMetrics = async () => {
    if (isLoading) return;
    setIsLoading(true);

    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (isDummyServer) {
      // Simulate dummy data
      setTimeout(() => {
        const lastPoint = historyRef.current[historyRef.current.length - 1];
        
        const cpuSim = Math.max(2, Math.min(98, (lastPoint?.cpu ?? 15) + (Math.random() - 0.5) * 12));
        const totalGB = 16.0;
        const baseUsedGB = lastPoint?.memUsedGB ?? 6.4;
        const usedGBPercentChange = (Math.random() - 0.5) * 0.1;
        const newUsedGB = Math.max(2.0, Math.min(15.5, baseUsedGB + usedGBPercentChange));
        const memPercentSim = (newUsedGB / totalGB) * 100;

        const diskReadSim = Math.max(0, (lastPoint ? lastPoint.diskReadKB : 45) + (Math.random() - 0.5) * 20 + (Math.random() > 0.9 ? 500 : 0));
        const diskWriteSim = Math.max(0, (lastPoint ? lastPoint.diskWriteKB : 20) + (Math.random() - 0.5) * 15 + (Math.random() > 0.9 ? 750 : 0));

        const netDownSim = Math.max(0.5, (lastPoint ? lastPoint.netDownKB : 120) + (Math.random() - 0.5) * 40 + (Math.random() > 0.95 ? 1200 : 0));
        const netUpSim = Math.max(0.2, (lastPoint ? lastPoint.netUpKB : 30) + (Math.random() - 0.5) * 10 + (Math.random() > 0.95 ? 400 : 0));
        
        // Simulating gradual disk partition usage
        const diskPercentSim = Math.round(Math.max(10, Math.min(99, 45 + Math.sin(Date.now() / 300000) * 15 + Math.random() * 2)));

        const newPoint: MetricHistoryPoint = {
          timeLabel: nowLabel,
          cpu: Math.round(cpuSim * 10) / 10,
          memPercent: Math.round(memPercentSim * 10) / 10,
          memUsedGB: Math.round(newUsedGB * 100) / 100,
          memTotalGB: totalGB,
          diskReadKB: Math.round(diskReadSim),
          diskWriteKB: Math.round(diskWriteSim),
          netDownKB: Math.round(netDownSim),
          netUpKB: Math.round(netUpSim),
          diskPercent: diskPercentSim
        };

        setMetrics(newPoint);
        historyRef.current = [...historyRef.current, newPoint].slice(-30); // Max 30 points
        if (monitorSubTab === 'dashboard') {
          updateCharts(historyRef.current);
        }
        
        // Run alert validation
        checkAlertThresholds(newPoint.cpu, newPoint.memPercent, newPoint.diskPercent, alertConfig);
        
        setIsLoading(false);
        setErrorCount(0);
        setConnectionError(null);
        setIsReconnecting(false);
      }, 300);
      return;
    }

    // Real server logic via SSH
    try {
      if (!window.serverOperator) {
        throw new Error('desktop bridges not available');
      }

      // Single combined script to read cpu, memory, disk, network
      const cmd = `
        echo "===CPU==="
        if command -v top >/dev/null 2>&1; then
          top -bn1 | grep -i "cpu(s)" | head -n 1
        fi
        echo "===VMSTAT==="
        if command -v vmstat >/dev/null 2>&1; then
          vmstat 1 2 | tail -n 1
        fi
        echo "===FREE==="
        if command -v free >/dev/null 2>&1; then
          free -b
        else
          cat /proc/meminfo 2>/dev/null
        fi
        echo "===DISKSTATS==="
        cat /proc/diskstats 2>/dev/null
        echo "===DF==="
        df -h . 2>/dev/null | tail -n 1
        echo "===NET==="
        cat /proc/net/dev 2>/dev/null
      `.trim();

      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: cmd,
        cwd: currentServer.cwd || undefined,
        proxy
      });

      if (!res.ok) {
        throw new Error(res.error || res.stderr || 'SSH execution error');
      }

      const stdout = res.stdout || '';
      
      // Parse blocks
      const sections: Record<string, string> = {};
      const markerRegex = /===([A-Z0-9_]+)===\n([\s\S]*?)(?=(?:===[A-Z0-9_]+===|$))/g;
      let m;
      while ((m = markerRegex.exec(stdout)) !== null) {
        sections[m[1]] = m[2];
      }

      // 1. CPU
      let cpu = 0;
      if (sections.CPU) {
        const idleMatch = sections.CPU.match(/(\d+(?:[\.,]\d+)?)\s*id/i);
        if (idleMatch) {
          cpu = 100 - parseFloat(idleMatch[1].replace(',', '.'));
        }
      }
      if (cpu === 0 && sections.VMSTAT) {
        const parts = sections.VMSTAT.trim().split(/\s+/);
        if (parts.length >= 15) {
          const us = parseInt(parts[parts.length - 5], 10) || 0;
          const sy = parseInt(parts[parts.length - 4], 10) || 0;
          cpu = us + sy;
        }
      }
      cpu = Math.max(0, Math.min(100, Math.round(cpu * 10) / 10));

      // 2. Memory
      let memTotal = 0;
      let memUsed = 0;

      if (sections.FREE) {
        const lines = sections.FREE.trim().split('\n');
        const memLine = lines.find(l => l.startsWith('Mem:'));
        if (memLine) {
          const parts = memLine.trim().split(/\s+/);
          if (parts.length >= 4) {
            memTotal = parseInt(parts[1], 10) || 0;
            memUsed = parseInt(parts[2], 10) || 0;
          }
        } else {
          // Parse /proc/meminfo
          let totalKB = 0;
          let availKB = 0;
          for (const line of lines) {
            if (line.startsWith('MemTotal:')) totalKB = parseInt(line.replace(/[^0-9]/g, ''), 10) || 0;
            else if (line.startsWith('MemAvailable:')) availKB = parseInt(line.replace(/[^0-9]/g, ''), 10) || 0;
          }
          if (totalKB > 0) {
            memTotal = totalKB * 1024;
            const avail = availKB > 0 ? availKB * 1024 : 0;
            memUsed = memTotal - avail;
          }
        }
      }
      
      const memTotalGB = memTotal / (1024 * 1024 * 1024);
      const memUsedGB = memUsed / (1024 * 1024 * 1024);
      const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

      // 3. Disk I/O (Fallback to vmstat or use diskstats)
      let diskReadKB = 0;
      let diskWriteKB = 0;
      
      if (sections.DISKSTATS) {
        const lines = sections.DISKSTATS.trim().split('\n');
        let currentReadSectors = 0;
        let currentWriteSectors = 0;
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 10) {
            const devName = parts[2];
            // Match physical drives sda, sdb, nvmeXnY, vda, vdb, xvda...
            if (/^(sd[a-z]|vd[a-z]|nvme\d+n\d+|xvd[a-z])$/.test(devName)) {
              currentReadSectors += parseInt(parts[5], 10) || 0;     // Field 6: sectors read
              currentWriteSectors += parseInt(parts[9], 10) || 0;    // Field 10: sectors written
            }
          }
        }

        const now = Date.now();
        const prevDisk = prevDiskRef.current;
        prevDiskRef.current = { readSectors: currentReadSectors, writeSectors: currentWriteSectors, time: now };

        if (prevDisk && prevDisk.time > 0 && now > prevDisk.time) {
          const dt = (now - prevDisk.time) / 1000;
          // 1 sector = 512 bytes = 0.5 KB
          diskReadKB = Math.max(0, ((currentReadSectors - prevDisk.readSectors) * 0.5) / dt);
          diskWriteKB = Math.max(0, ((currentWriteSectors - prevDisk.writeSectors) * 0.5) / dt);
        }
      }
      
      // Fallback disk metrics from VMSTAT if diskstats was 0
      if (diskReadKB === 0 && diskWriteKB === 0 && sections.VMSTAT) {
        const parts = sections.VMSTAT.trim().split(/\s+/);
        if (parts.length >= 10) {
          // bi, bo are in blocks/s. Assume block = 1KB
          diskReadKB = parseInt(parts[8], 10) || 0;
          diskWriteKB = parseInt(parts[9], 10) || 0;
        }
      }

      // Parse disk space utilization % from DF block
      let diskPercent = 0;
      if (sections.DF) {
        const dfMatch = sections.DF.match(/(\d+)%/);
        if (dfMatch) {
          diskPercent = parseInt(dfMatch[1], 10) || 0;
        }
      }

      // 4. Network bandwidth
      let netDownKB = 0;
      let netUpKB = 0;

      if (sections.NET) {
        const lines = sections.NET.trim().split('\n');
        let totalRx = 0;
        let totalTx = 0;
        for (const line of lines) {
          if (line.includes(':')) {
            const parts = line.split(':');
            const iface = parts[0].trim();
            if (iface !== 'lo') {
              const stats = parts[1].trim().split(/\s+/);
              if (stats.length >= 9) {
                totalRx += parseInt(stats[0], 10) || 0; // rx bytes
                totalTx += parseInt(stats[8], 10) || 0; // tx bytes
              }
            }
          }
        }

        const now = Date.now();
        const prevNet = prevNetRef.current;
        prevNetRef.current = { rx: totalRx, tx: totalTx, time: now };

        if (prevNet && prevNet.time > 0 && now > prevNet.time) {
          const dt = (now - prevNet.time) / 1000;
          netDownKB = Math.max(0, ((totalRx - prevNet.rx) / 1024) / dt);
          netUpKB = Math.max(0, ((totalTx - prevNet.tx) / 1024) / dt);
        }
      }

      const newPoint: MetricHistoryPoint = {
        timeLabel: nowLabel,
        cpu: Math.round(cpu * 10) / 10,
        memPercent: Math.round(memPercent * 10) / 10,
        memUsedGB: Math.round(memUsedGB * 100) / 100,
        memTotalGB: Math.round(memTotalGB * 100) / 100,
        diskReadKB: Math.round(diskReadKB),
        diskWriteKB: Math.round(diskWriteKB),
        netDownKB: Math.round(netDownKB),
        netUpKB: Math.round(netUpKB),
        diskPercent
      };

      setMetrics(newPoint);
      setDataReceived(true);
      historyRef.current = [...historyRef.current, newPoint].slice(-30);
      if (monitorSubTab === 'dashboard') {
        updateCharts(historyRef.current);
      }

      // Check thresholds
      checkAlertThresholds(newPoint.cpu, newPoint.memPercent, newPoint.diskPercent, alertConfig);

      setErrorCount(0);
      setConnectionError(null);
      setIsReconnecting(false);
    } catch (e: any) {
      console.error('Monitoring query failed:', e);
      const msg = e.message || String(e);
      const nextErrorCount = errorCount + 1;
      setErrorCount(nextErrorCount);

      if (nextErrorCount >= 2) {
        setIsReconnecting(true);
        setConnectionError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Triggers polling periodically
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Run immediately on active
    fetchMetrics();

    timerRef.current = setInterval(fetchMetrics, refreshInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, refreshInterval, currentServer.id, alertConfig]);

  const handleManualRefresh = () => {
    fetchMetrics();
  };

  const handleRetryPolling = () => {
    setDataReceived(false);
    setPollingFailed(false);
    setShowSkeleton(true);
    
    setTimeout(() => {
      setShowSkeleton(false);
    }, 3000);

    setTimeout(() => {
      setDataReceived((current) => {
        if (!current) {
          setPollingFailed(true);
        }
        return current;
      });
    }, 10000);

    fetchMetrics();
  };

  const formatSpeed = (kbps: number) => {
    if (kbps > 1024) {
      return `${(kbps / 1024).toFixed(1)} MB/s`;
    }
    return `${kbps.toFixed(0)} KB/s`;
  };

  const handleSendTestNotification = async () => {
    if (!window.serverOperator) return;
    try {
      await window.serverOperator.triggerNotification({
        title: `Test Alert: ${currentServer.name}`,
        body: 'This is a test notification from your Server Operator app alerting configurations!'
      });
      // Trigger test webhook if enabled
      if (alertConfig.webhooksEnabled && alertConfig.webhookUrl.trim()) {
        await window.serverOperator.sendWebhook({
          url: alertConfig.webhookUrl.trim(),
          payload: {
            event: 'test_alert',
            serverId: currentServer.id,
            serverName: currentServer.name,
            message: 'This is a test webhook broadcast payload from Server Operator!',
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (err) {
      console.error('Failed to trigger test notification:', err);
    }
  };

  const getDisplayServices = (servicesObj: Record<string, 'up' | 'down'>) => {
    const displayList: Array<{ id: string; name: string; status: 'up' | 'down' }> = [];
    const keys = Object.keys(servicesObj);
    
    if (keys.includes('nginx')) {
      displayList.push({ id: 'nginx', name: 'Nginx Web Server', status: servicesObj['nginx'] });
    }
    if (keys.includes('docker')) {
      displayList.push({ id: 'docker', name: 'Docker Engine', status: servicesObj['docker'] });
    }
    
    const pgUp = servicesObj['postgresql'] || servicesObj['postgres'];
    if (pgUp) {
      displayList.push({ id: 'postgres', name: 'PostgreSQL Database', status: pgUp });
    }
    
    if (keys.includes('mysql')) {
      displayList.push({ id: 'mysql', name: 'MySQL Database', status: servicesObj['mysql'] });
    }
    
    const redisUp = servicesObj['redis-server'] || servicesObj['redis'];
    if (redisUp) {
      displayList.push({ id: 'redis', name: 'Redis Cache/Store', status: redisUp });
    }
    
    if (keys.includes('apache2')) {
      displayList.push({ id: 'apache2', name: 'Apache Web Server', status: servicesObj['apache2'] });
    }
    
    const mongoUp = servicesObj['mongodb'] || servicesObj['mongod'];
    if (mongoUp) {
      displayList.push({ id: 'mongodb', name: 'MongoDB Database', status: mongoUp });
    }

    for (const k of keys) {
      if (!['nginx', 'docker', 'postgresql', 'postgres', 'mysql', 'redis-server', 'redis', 'apache2', 'mongodb', 'mongod'].includes(k)) {
        displayList.push({ id: k, name: k, status: servicesObj[k] });
      }
    }
    
    return displayList;
  };

  const displayServices = getDisplayServices(servicesStatus);

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-0 overflow-auto">
      {/* Control bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--accent)] shrink-0">
            <ServerIcon size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{currentServer.name}</h2>
              {connectionError ? (
                <span className="flex items-center gap-1 text-xs text-[var(--error)] bg-[var(--error)]/10 px-2 py-0.5 rounded-full font-medium animate-pulse">
                  <WifiOff size={12} /> Offline
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full font-medium">
                  <Wifi size={12} /> Live
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{currentServer.username}@{currentServer.host}</p>
          </div>
        </div>

        {/* Polling adjustments */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium transition-colors ${
              isPlaying
                ? 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
            }`}
            title={isPlaying ? 'Pause streaming' : 'Resume streaming'}
          >
            {isPlaying ? (
              <>
                <Pause size={14} /> Pause
              </>
            ) : (
              <>
                <Play size={14} /> Resume
              </>
            )}
          </button>

          <select
            aria-label="Refresh Interval"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value={1000}>1s Interval</option>
            <option value={2000}>2s Interval</option>
            <option value={5000}>5s Interval</option>
            <option value={10000}>10s Interval</option>
          </select>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="p-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Sub tabs navigation */}
      <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 gap-6 shrink-0">
        <button
          type="button"
          onClick={() => setMonitorSubTab('dashboard')}
          className={`py-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            monitorSubTab === 'dashboard'
              ? 'border-[var(--accent)] text-[var(--accent-hover)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Activity size={14} />
            Dashboard
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMonitorSubTab('resource-history')}
          className={`py-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            monitorSubTab === 'resource-history'
              ? 'border-[var(--accent)] text-[var(--accent-hover)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <LineChart size={14} />
            Resource History
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMonitorSubTab('history')}
          className={`py-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            monitorSubTab === 'history'
              ? 'border-[var(--accent)] text-[var(--accent-hover)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Database size={14} />
            Alert Logs
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMonitorSubTab('settings')}
          className={`py-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
            monitorSubTab === 'settings'
              ? 'border-[var(--accent)] text-[var(--accent-hover)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Sliders size={14} />
            Alert Settings
          </span>
        </button>
      </div>

      {/* ── Sub Tab 1: Dashboard Charts ── */}
      {monitorSubTab === 'dashboard' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Connection Drop Warning Overlay */}
          {connectionError && (
            <div className="mx-6 mt-4 rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
              <div className="flex gap-2.5 items-start">
                <AlertTriangle size={18} className="text-[var(--error)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[var(--error)]">SSH Connection dropped</p>
                  <p className="text-xs text-[var(--text-primary)] mt-0.5 break-all font-mono">{connectionError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-[var(--error)] hover:bg-[var(--error)]/90 text-white shrink-0 shadow-sm"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                Reconnect Now
              </button>
            </div>
          )}

          {/* Amber SSH Failure Warning Banner */}
          {pollingFailed && (
            <div className="mx-6 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
              <div className="flex gap-2.5 items-start">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-500">Could not fetch metrics — check SSH connection</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRetryPolling}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-600 text-white shrink-0 shadow-sm"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                Retry
              </button>
            </div>
          )}

          {/* Live numerical metrics overview cards */}
          {showSkeleton || !dataReceived ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-4 shrink-0">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded bg-[var(--bg-tertiary)] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-[var(--bg-tertiary)] rounded w-1/2" />
                    <div className="h-5 bg-[var(--bg-tertiary)] rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-4 shrink-0">
              {/* CPU */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex items-center gap-3">
                <div className="p-2 rounded bg-emerald-500/10 text-[var(--success)]">
                  <Cpu size={20} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">CPU Load</p>
                  <p className="text-lg font-bold font-mono">{metrics.cpu}%</p>
                </div>
              </div>

              {/* RAM */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex items-center gap-3">
                <div className="p-2 rounded bg-blue-500/10 text-[var(--accent-hover)]">
                  <Activity size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-secondary)] font-medium">Memory</p>
                  <p className="text-lg font-bold font-mono truncate">
                    {metrics.memPercent}% <span className="text-xs text-[var(--text-muted)] font-normal">({metrics.memUsedGB.toFixed(1)}G/{metrics.memTotalGB.toFixed(0)}G)</span>
                  </p>
                </div>
              </div>

              {/* Disk */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex items-center gap-3">
                <div className="p-2 rounded bg-amber-500/10 text-[var(--warning)]">
                  <HardDrive size={20} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">Disk Space / I/O</p>
                  <p className="text-sm font-semibold font-mono">
                    <span className="text-[var(--text-muted)] font-normal text-xs">Used:</span> {metrics.diskPercent}%
                  </p>
                  <p className="text-xs font-mono text-[var(--text-secondary)] mt-0.5">
                    R: {formatSpeed(metrics.diskReadKB)} | W: {formatSpeed(metrics.diskWriteKB)}
                  </p>
                </div>
              </div>

              {/* Network */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex items-center gap-3">
                <div className="p-2 rounded bg-cyan-500/10 text-cyan-400">
                  <Network size={20} />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">Network</p>
                  <p className="text-sm font-semibold font-mono">
                    <span className="text-[var(--text-muted)]">Down:</span> {formatSpeed(metrics.netDownKB)}
                  </p>
                  <p className="text-sm font-semibold font-mono mt-0.5">
                    <span className="text-[var(--text-muted)]">Up:</span> {formatSpeed(metrics.netUpKB)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grid of live charts */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 min-h-[500px]">
            {/* CPU Chart */}
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col relative min-h-[250px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">CPU Utilization (%)</h3>
                {isReconnecting && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for SSH data…</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 relative">
                {!dataReceived && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/85 backdrop-blur-[0.5px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for first data point…</span>
                  </div>
                )}
                <canvas ref={cpuCanvasRef} />
              </div>
            </div>

            {/* RAM Chart */}
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col relative min-h-[250px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Memory Utilization (%)</h3>
                {isReconnecting && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for SSH data…</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 relative">
                {!dataReceived && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/85 backdrop-blur-[0.5px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for first data point…</span>
                  </div>
                )}
                <canvas ref={ramCanvasRef} />
              </div>
            </div>

            {/* Disk I/O Chart */}
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col relative min-h-[250px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Disk Throughput (KB/s)</h3>
                {isReconnecting && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for SSH data…</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 relative">
                {!dataReceived && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/85 backdrop-blur-[0.5px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for first data point…</span>
                  </div>
                )}
                <canvas ref={diskCanvasRef} />
              </div>
            </div>

            {/* Network Chart */}
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col relative min-h-[250px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Network Speed (KB/s)</h3>
                {isReconnecting && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/80 backdrop-blur-[1px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for SSH data…</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 relative">
                {!dataReceived && (
                  <div className="absolute inset-0 bg-[var(--bg-secondary)]/85 backdrop-blur-[0.5px] flex items-center justify-center rounded-lg z-10">
                    <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for first data point…</span>
                  </div>
                )}
                <canvas ref={netCanvasRef} />
              </div>
            </div>
          </div>

          {/* Uptime & Services Status section */}
          <div className="border-t border-[var(--border)] mt-4 p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">Uptime & Background Services (Pings every 60s)</h3>
                <span className={`w-2.5 h-2.5 rounded-full ${
                  overallStatus === 'green' ? 'bg-[var(--success)]' :
                  overallStatus === 'yellow' ? 'bg-[var(--warning)]' :
                  overallStatus === 'red' ? 'bg-[var(--error)]' : 'bg-[var(--text-muted)]'
                }`} title={`Overall status: ${overallStatus}`} />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Last checked: {lastCheckedTime ? new Date(lastCheckedTime).toLocaleString() : 'Never'}
              </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left Column: Services Status Grid */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Detected Services</h4>
                
                {displayServices.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-12 text-[var(--text-muted)] text-sm">
                    No monitored services detected on this server.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {displayServices.map((svc) => (
                      <div key={svc.id} className="border border-[var(--border)] bg-[var(--bg-primary)] rounded-md p-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{svc.name}</p>
                          <p className="text-xs text-[var(--text-secondary)] font-mono">{svc.id}.service</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase ${
                          svc.status === 'up' 
                            ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20' 
                            : 'bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 animate-pulse'
                        }`}>
                          {svc.status === 'up' ? 'Active' : 'Down'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Latency Chart */}
              <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col min-h-[300px]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">SSH Latency History</h4>
                <div className="flex-1 min-h-0 relative">
                  {!dataReceived && (
                    <div className="absolute inset-0 bg-[var(--bg-secondary)]/85 backdrop-blur-[0.5px] flex items-center justify-center rounded-lg z-10">
                      <span className="text-xs text-[var(--text-muted)] animate-pulse">Waiting for first data point…</span>
                    </div>
                  )}
                  <canvas ref={latencyCanvasRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Tab 4: Resource History Charts ── */}
      {monitorSubTab === 'resource-history' && (
        <div className="flex-1 flex flex-col p-6 min-h-0 font-sans">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4 shrink-0">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Resource Usage History</h3>
              <p className="text-xs text-[var(--text-secondary)]">Historical CPU, RAM, and Disk consumption trends stored in local SQLite database</p>
            </div>

            {/* Presets and Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex border border-[var(--border)] bg-[var(--bg-secondary)] rounded p-0.5">
                {(['1h', '6h', '24h', '7d'] as const).map((win) => (
                  <button
                    key={win}
                    type="button"
                    onClick={() => {
                      setHistoryWindow(win);
                      setHistoryStartDate('');
                      setHistoryEndDate('');
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                      historyWindow === win && !historyStartDate
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {win}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={exportToCSV}
                disabled={historicalData.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors cursor-pointer"
                title="Export data as CSV"
              >
                Export CSV
              </button>

              <button
                type="button"
                onClick={handleClearHistoricalMetrics}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[var(--error)]/10 border border-[var(--error)]/30 hover:bg-[var(--error)]/25 text-[var(--error)] transition-colors cursor-pointer"
                title="Clear metrics for this server"
              >
                Clear History
              </button>
            </div>
          </div>

          {/* Date range picker bar */}
          <div className="flex flex-wrap items-end gap-3 p-4 mb-4 border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg shrink-0">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]" htmlFor="start-date-input">Start Date / Time</label>
              <input
                id="start-date-input"
                type="datetime-local"
                value={historyStartDate}
                onChange={(e) => {
                  setHistoryStartDate(e.target.value);
                  setHistoryWindow('24h');
                }}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]" htmlFor="end-date-input">End Date / Time (Optional)</label>
              <input
                id="end-date-input"
                type="datetime-local"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchHistoricalData(true)}
              disabled={historicalLoading}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {historicalLoading ? 'Loading…' : 'Query Custom Range'}
            </button>
          </div>

          {/* Main Chart Card */}
          <div className="flex-1 border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-5 flex flex-col min-h-[350px]">
            {historicalLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
                <RefreshCw size={24} className="animate-spin" />
                <span className="text-xs">Querying SQLite history…</span>
              </div>
            ) : historicalError ? (
              <div className="flex-1 flex items-center justify-center text-[var(--error)] text-sm">
                Error: {historicalError}
              </div>
            ) : historicalData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] text-center font-sans py-12">
                <LineChart size={32} className="text-[var(--text-muted)]/50 mb-3" />
                <p className="text-sm font-medium text-[var(--text-primary)]">No metrics found for this query</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md">
                  Server Operator records CPU, RAM, and Disk utilization in the background every 60 seconds. Verify the server is running and reachable.
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 relative">
                <canvas ref={historicalCanvasRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub Tab 2: Alert History Logs ── */}
      {monitorSubTab === 'history' && (
        <div className="flex-1 flex flex-col p-6 min-h-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Alert History</h3>
              <p className="text-xs text-[var(--text-secondary)]">Past metric anomalies recorded in SQLite database for {currentServer.name}</p>
            </div>
            {alertLogs.length > 0 && (
              <button
                type="button"
                onClick={handleClearAlertHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-[var(--error)]/20 hover:bg-[var(--error)] text-[var(--error)] hover:text-white border border-[var(--error)]/40 hover:border-transparent transition-all cursor-pointer"
              >
                <Trash2 size={12} />
                Clear SQLite Logs
              </button>
            )}
          </div>

          <div className="flex-1 border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg overflow-hidden flex flex-col min-h-[300px]">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] sticky top-0">
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                    <th className="px-4 py-3 font-semibold">Metric</th>
                    <th className="px-4 py-3 font-semibold">Trigger Value</th>
                    <th className="px-4 py-3 font-semibold">Threshold</th>
                    <th className="px-4 py-3 font-semibold">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {alertLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-[var(--text-secondary)] font-sans">
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center gap-3 py-6"
                        >
                          <ShieldCheck size={48} className="text-[var(--text-muted)] opacity-40" />
                          <h4 className="text-sm font-semibold text-[var(--text-primary)]">No alerts yet</h4>
                          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                            Threshold breaches from CPU, RAM, and Disk monitoring will appear here automatically.
                          </p>
                        </motion.div>
                      </td>
                    </tr>
                  ) : (
                    alertLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--bg-tertiary)]/50 transition-colors">
                        <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {log.metricType === 'CPU' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-[var(--success)] border border-emerald-500/20">
                              CPU
                            </span>
                          )}
                          {log.metricType === 'RAM' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-[var(--accent-hover)] border border-blue-500/20">
                              RAM
                            </span>
                          )}
                          {log.metricType === 'DISK' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-[var(--warning)] border border-amber-500/20">
                              DISK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold">{log.metricValue.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{log.thresholdValue}%</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] break-words max-w-[400px]">{log.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Tab 3: Alert Settings Form ── */}
      {monitorSubTab === 'settings' && (
        <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Alert Settings</h3>
            <p className="text-xs text-[var(--text-secondary)]">Customize monitoring notification boundaries and reporting channels per server.</p>
          </div>

          <style>{`
            .custom-range-input::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: var(--accent);
              cursor: pointer;
              transition: transform 0.1s;
              border: none;
            }
            .custom-range-input::-webkit-slider-thumb:hover {
              transform: scale(1.2);
            }
            .custom-range-input::-moz-range-thumb {
              width: 14px;
              height: 14px;
              border-radius: 50%;
              background: var(--accent);
              cursor: pointer;
              border: none;
              transition: transform 0.1s;
            }
            .custom-range-input::-moz-range-thumb:hover {
              transform: scale(1.2);
            }
          `}</style>

          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-5 space-y-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 flex items-center gap-1.5">
                <Sliders size={12} />
                Breach Thresholds
              </h4>

              {/* CPU threshold */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="cpu-slider" className="text-xs font-medium text-[var(--text-primary)]">CPU Threshold</label>
                  <span className="text-xs font-semibold font-mono text-[var(--accent-hover)]">{alertConfig.cpuThreshold}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="cpu-slider"
                    type="range"
                    min={10}
                    max={95}
                    value={alertConfig.cpuThreshold}
                    onChange={(e) => setAlertConfig({ ...alertConfig, cpuThreshold: Number(e.target.value) })}
                    className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer custom-range-input"
                    style={{
                      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((alertConfig.cpuThreshold - 10) / (95 - 10)) * 100}%, var(--border) ${((alertConfig.cpuThreshold - 10) / (95 - 10)) * 100}%, var(--border) 100%)`
                    }}
                  />
                  <input
                    aria-label="CPU Threshold percentage"
                    type="number"
                    value={alertConfig.cpuThreshold === 0 ? '' : alertConfig.cpuThreshold}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseInt(val, 10);
                      setAlertConfig({ ...alertConfig, cpuThreshold: isNaN(parsed) ? 0 : parsed });
                    }}
                    onBlur={() => {
                      setAlertConfig({ ...alertConfig, cpuThreshold: Math.max(10, Math.min(95, alertConfig.cpuThreshold || 10)) });
                    }}
                    className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-center text-xs font-mono"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">Triggers when CPU load percentage exceeds this limit.</p>
              </div>

              {/* RAM threshold */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="ram-slider" className="text-xs font-medium text-[var(--text-primary)]">RAM Utilization Threshold</label>
                  <span className="text-xs font-semibold font-mono text-[var(--accent-hover)]">{alertConfig.ramThreshold}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="ram-slider"
                    type="range"
                    min={10}
                    max={95}
                    value={alertConfig.ramThreshold}
                    onChange={(e) => setAlertConfig({ ...alertConfig, ramThreshold: Number(e.target.value) })}
                    className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer custom-range-input"
                    style={{
                      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((alertConfig.ramThreshold - 10) / (95 - 10)) * 100}%, var(--border) ${((alertConfig.ramThreshold - 10) / (95 - 10)) * 100}%, var(--border) 100%)`
                    }}
                  />
                  <input
                    aria-label="RAM Threshold percentage"
                    type="number"
                    value={alertConfig.ramThreshold === 0 ? '' : alertConfig.ramThreshold}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseInt(val, 10);
                      setAlertConfig({ ...alertConfig, ramThreshold: isNaN(parsed) ? 0 : parsed });
                    }}
                    onBlur={() => {
                      setAlertConfig({ ...alertConfig, ramThreshold: Math.max(10, Math.min(95, alertConfig.ramThreshold || 10)) });
                    }}
                    className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-center text-xs font-mono"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">Triggers when used Memory compared to Total physical RAM exceeds this percentage.</p>
              </div>

              {/* Disk threshold */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="disk-slider" className="text-xs font-medium text-[var(--text-primary)]">Disk Usage Threshold</label>
                  <span className="text-xs font-semibold font-mono text-[var(--accent-hover)]">{alertConfig.diskThreshold}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="disk-slider"
                    type="range"
                    min={10}
                    max={98}
                    value={alertConfig.diskThreshold}
                    onChange={(e) => setAlertConfig({ ...alertConfig, diskThreshold: Number(e.target.value) })}
                    className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer custom-range-input"
                    style={{
                      background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((alertConfig.diskThreshold - 10) / (98 - 10)) * 100}%, var(--border) ${((alertConfig.diskThreshold - 10) / (98 - 10)) * 100}%, var(--border) 100%)`
                    }}
                  />
                  <input
                    aria-label="Disk Threshold percentage"
                    type="number"
                    value={alertConfig.diskThreshold === 0 ? '' : alertConfig.diskThreshold}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parsed = parseInt(val, 10);
                      setAlertConfig({ ...alertConfig, diskThreshold: isNaN(parsed) ? 0 : parsed });
                    }}
                    onBlur={() => {
                      setAlertConfig({ ...alertConfig, diskThreshold: Math.max(10, Math.min(98, alertConfig.diskThreshold || 10)) });
                    }}
                    className="w-16 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-center text-xs font-mono"
                  />
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">Triggers when local disk space occupancy rate exceeds this ratio.</p>
              </div>
            </div>

            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-lg p-5 space-y-5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 flex items-center gap-1.5">
                <Bell size={12} />
                Notification Channels
              </h4>

              {/* Desktop notifications toggle */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <label htmlFor="desktop-alert-toggle" className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer">Desktop Notifications</label>
                  <p className="text-[10px] text-[var(--text-secondary)]">Deliver instant native system toast messages using Electron's Notification API.</p>
                </div>
                <input
                  id="desktop-alert-toggle"
                  type="checkbox"
                  checked={alertConfig.desktopNotifications}
                  onChange={(e) => setAlertConfig({ ...alertConfig, desktopNotifications: e.target.checked })}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer bg-[var(--bg-primary)]"
                />
              </div>

              <div className="border-t border-[var(--border)] pt-4 space-y-4">
                {/* Webhooks toggle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <label htmlFor="webhook-alert-toggle" className="text-xs font-semibold text-[var(--text-primary)] cursor-pointer">Webhook HTTP Broadcasts</label>
                    <p className="text-[10px] text-[var(--text-secondary)]">POST alerts payload (JSON format) directly to slack, discord, or your custom alert receiver endpoint.</p>
                  </div>
                  <input
                    id="webhook-alert-toggle"
                    type="checkbox"
                    checked={alertConfig.webhooksEnabled}
                    onChange={(e) => setAlertConfig({ ...alertConfig, webhooksEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer bg-[var(--bg-primary)]"
                  />
                </div>

                {/* Webhook input URL */}
                {alertConfig.webhooksEnabled && (
                  <div className="space-y-1.5 pt-1">
                    <label htmlFor="webhook-url" className="text-xs font-medium text-[var(--text-primary)]">Webhook URL Endpoint</label>
                    <input
                      id="webhook-url"
                      type="url"
                      placeholder="e.g. https://discord.com/api/webhooks/... or https://hooks.slack.com/services/..."
                      value={alertConfig.webhookUrl}
                      onChange={(e) => setAlertConfig({ ...alertConfig, webhookUrl: e.target.value })}
                      className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              {settingsSavedMessage && (
                <span className="flex items-center gap-1 text-xs text-[var(--success)] font-medium">
                  <CheckCircle size={14} /> Settings Saved!
                </span>
              )}
              <button
                type="button"
                onClick={handleSendTestNotification}
                className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs font-semibold transition-colors cursor-pointer"
              >
                Send Test Alert
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </form>

          {/* Danger Zone Card */}
          <div className="mt-8 border border-[var(--error)]/30 bg-[var(--bg-secondary)] rounded-lg p-5 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--error)] border-b border-[var(--border)] pb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} />
              Danger Zone
            </h4>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Clear Notification Log History</p>
                <p className="text-[10px] text-[var(--text-secondary)]">Permanently erase all historical alert metrics logs saved in SQLite for this server.</p>
              </div>
              <button
                type="button"
                onClick={handleClearAlertHistory}
                className="px-3 py-2 rounded bg-[var(--error)]/15 border border-[var(--error)]/30 hover:bg-[var(--error)] hover:border-transparent text-[var(--error)] hover:text-white text-xs font-semibold transition-all cursor-pointer shrink-0"
              >
                Clear Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
