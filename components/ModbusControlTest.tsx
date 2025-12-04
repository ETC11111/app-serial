import React, { useCallback, useEffect, useState, useRef } from 'react';
import { toast } from 'react-toastify';

type Device = {
  id: string;
  device_id: string;
  device_name: string;
  local_ip?: string;
};

type NutrientSettings = {
  target_ph: number | string;
  target_ec: number | string;
  error_ph: number | string;
  error_ec: number | string;
  supply_time: number | string;
  cycle_time: number | string;
  bed_a: number;
  bed_b: number;
  bed_c: number;
  bed_d: number;
};

type NutrientSchedule = {
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  time_based_enabled: number;
  once_based_enabled: number;
  daily_based_enabled: number;
};

type NPNScheduleEntry = {
  start: string;
  end: string;
  enabled: boolean;
};

type NPNChannelSchedule = {
  channel: number;
  enabled: boolean;
  schedules: NPNScheduleEntry[];
};

type ActiveSchedule = {
  channel: number;
  startTime: number;
  endTime: number;
  isActive: boolean;
};

function extractAccessToken(): string | null {
  const urlToken = new URL(window.location.href).searchParams.get('token');
  if (urlToken && urlToken !== 'null' && urlToken !== 'undefined') {
    return urlToken.startsWith('Bearer ') ? urlToken : `Bearer ${urlToken}`;
  }
  const localToken = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt') || localStorage.getItem('accessToken');
  if (localToken && localToken !== 'null' && localToken !== 'undefined') {
    return localToken.startsWith('Bearer ') ? localToken : `Bearer ${localToken}`;
  }
  const cookieToken = document.cookie
    .split('; ')
    .find(row => row.startsWith('accessToken='))?.split('=')[1];
  if (cookieToken && cookieToken !== 'null' && cookieToken !== 'undefined') {
    return cookieToken.startsWith('Bearer ') ? cookieToken : `Bearer ${cookieToken}`;
  }
  return null;
}

function useApi() {
  const getHeaders = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    const token = extractAccessToken();
    if (token) h['Authorization'] = token;
    return h;
  };

  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { ...getHeaders(), ...options.headers },
      credentials: 'include',
    });

    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || `${response.status} ${response.statusText}`);
    }
    return data;
  }, []);

  return { apiCall };
}

const ModbusControlTest: React.FC = () => {
  const BASE_URL = '/api/commands';
  const { apiCall } = useApi();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'nutrient' | 'npn' | 'uno'>('nutrient');

  const [npnStates, setNpnStates] = useState<boolean[]>(Array(12).fill(false));
  const [mqttConnected, setMqttConnected] = useState(false);
  const lastProcessedResponseIdRef = useRef<string | null>(null);

  const [npnSchedules, setNpnSchedules] = useState<NPNChannelSchedule[]>(
    Array.from({ length: 12 }, (_, i) => ({
      channel: i,
      enabled: false,
      schedules: []
    }))
  );
  const [activeSchedules, setActiveSchedules] = useState<ActiveSchedule[]>([]);
  const [showNpnScheduler, setShowNpnScheduler] = useState(false);
  
  const [bulkStartTime, setBulkStartTime] = useState('06:00');
  const [bulkEndTime, setBulkEndTime] = useState('18:00');

  const [nutrientSettings, setNutrientSettings] = useState<NutrientSettings>({
    target_ph: 6.5,
    target_ec: 1.2,
    error_ph: 5.0,
    error_ec: 10.0,
    supply_time: 5.0,
    cycle_time: 4.0,
    bed_a: 1,
    bed_b: 1,
    bed_c: 1,
    bed_d: 1,
  });

  const [nutrientSchedule, setNutrientSchedule] = useState<NutrientSchedule>({
    start_hour: 6,
    start_minute: 0,
    end_hour: 18,
    end_minute: 0,
    time_based_enabled: 0,
    once_based_enabled: 0,
    daily_based_enabled: 1,
  });

  const [nutrientCycleStatus, setNutrientCycleStatus] = useState({
    cycle: -1,
    cycleStatus: 0,
    elapsedTime: 0,
    remainingTime: 0,
    currentPH: 6.5,
    currentEC: 1.2,
    isActive: false
  });

  const [unoChannels, setUnoChannels] = useState<boolean[]>(Array(10).fill(false));

  const hours24 = Array.from({ length: 24 }, (_, h) => h);
  const minutes5 = Array.from({ length: 12 }, (_, i) => i * 5);
  const minutes60 = Array.from({ length: 60 }, (_, m) => m);

  const [channelModes, setChannelModes] = useState<{[key: number]: string}>({});

  // 디버깅용 useEffect
  useEffect(() => {
    console.log('🔍 selectedDevice 변경됨:', selectedDevice);
  }, [selectedDevice]);

  const loadDevices = useCallback(async () => {
    try {
      const data = await apiCall('/api/devices');
      setDevices(data.devices || []);
    } catch (e: any) {
      toast.error(`장치 조회 실패: ${e.message}`);
    }
  }, [apiCall]);

  const loadNpnSchedules = useCallback(async () => {
    if (!selectedDevice) return;
    
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      const data = await apiCall(`${BASE_URL}/npn-schedules/${id}`);
      setNpnSchedules(data.schedules || Array.from({ length: 12 }, (_, i) => ({
        channel: i,
        enabled: false,
        schedules: []
      })));
    } catch (e: any) {
      console.error('NPN 스케줄 로드 실패:', e);
    }
  }, [apiCall, BASE_URL, selectedDevice]);

  const loadActiveSchedules = useCallback(async () => {
    if (!selectedDevice) return;
    
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      const data = await apiCall(`${BASE_URL}/active-schedules/${id}`);
      setActiveSchedules(data.activeSchedules || []);
    } catch (e: any) {
      console.error('활성 스케줄 로드 실패:', e);
    }
  }, [apiCall, BASE_URL, selectedDevice]);

  const loadChannelModes = useCallback(async () => {
    if (!selectedDevice) return;
    
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      const data = await apiCall(`${BASE_URL}/channel-modes/${id}`);
      setChannelModes(data.modes || {});
    } catch (e: any) {
      console.error('채널 모드 로드 실패:', e);
    }
  }, [apiCall, BASE_URL, selectedDevice]);

  const setAutoMode = async () => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    setLoading(true);
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      await apiCall(`${BASE_URL}/auto-mode/${id}`, {
        method: 'POST',
      });

      const newModes: {[key: number]: string} = {};
      for (let i = 0; i < 12; i++) {
        newModes[i] = 'auto';
      }
      setChannelModes(newModes);

      toast.success('모든 채널이 자동 모드로 설정되었습니다');
    } catch (e: any) {
      toast.error(`자동 모드 설정 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getCycleStatusText = (cycle: number) => {
    if (cycle === -1) return '미작동';
    if (cycle === 0) return '다음 관수 대기';
    if (cycle >= 1 && cycle <= 5) return '양액 배합 중';
    if (cycle >= 6) return '관수 중';
    return '알 수 없음';
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 0: return '#718096';
      case 1: return '#ed8936';
      case 2: return '#38a169';
      case 3: return '#4299e1';
      default: return '#718096';
    }
  };

  const formatElapsedTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}분 ${seconds}초`;
  };

  const formatRemainingTime = (ms: number) => {
    if (ms <= 0) return '0분 0초';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}분 ${seconds}초`;
  };

  const pollStatus = useCallback(async () => {
    try {
      const mqttData = await apiCall(`${BASE_URL}/mqtt-status`);
      setMqttConnected(mqttData.mqtt?.connected || false);

      if (selectedDevice) {
        const id = encodeURIComponent(selectedDevice.device_id);

        try {
          const respData = await apiCall(`${BASE_URL}/responses/${id}`);
          const response = respData.latestResponse;
          
          if (response && response.kind === 'UNO_MODULE') {
            const responseId = response.command_id || response.id;
            
            if (responseId && responseId === lastProcessedResponseIdRef.current) {
              console.log('🔄 이미 처리된 응답, 건너뛰기:', responseId);
            } else {
              const success = response.success;
              const command = response.command;
              const channel = response.channel;
              
              if (success) {
                toast.success(`✅ UNO ${command} CH${channel} 성공`);
              } else {
                toast.error(`❌ UNO ${command} CH${channel} 실패`);
              }
              
              if (responseId) {
                lastProcessedResponseIdRef.current = responseId;
              }
            }
          }
        } catch (e) { }

        try {
          const statusData = await apiCall(`${BASE_URL}/nutrient-status/${id}`);
          if (statusData.success) {
            setNutrientCycleStatus({
              cycle: statusData.cycle || -1,
              cycleStatus: statusData.status || 0,
              elapsedTime: statusData.elapsedTime || 0,
              remainingTime: statusData.remainingTime || 0,
              currentPH: statusData.currentPH || 6.5,
              currentEC: statusData.currentEC || 1.2,
              isActive: statusData.isActive || false
            });
          }
        } catch (e) { }
        
        loadActiveSchedules();
      }
    } catch (e) { }
  }, [apiCall, BASE_URL, selectedDevice, loadActiveSchedules]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (selectedDevice) {
      setNpnStates(Array(12).fill(false));
      lastProcessedResponseIdRef.current = null;
      loadNpnSchedules();
      loadActiveSchedules();
      loadChannelModes();
    }
  }, [selectedDevice, loadNpnSchedules, loadActiveSchedules, loadChannelModes]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isActive = true;
    let lastPollTime = 0;
    const POLL_INTERVAL = 2000;

    const scheduleNextPoll = () => {
      if (!isActive) return;
      
      const now = Date.now();
      const timeSinceLastPoll = now - lastPollTime;
      const remainingTime = Math.max(0, POLL_INTERVAL - timeSinceLastPoll);
      
      timeoutId = setTimeout(async () => {
        if (!isActive) return;
        
        try {
          await pollStatus();
          await loadChannelModes();
          lastPollTime = Date.now();
        } catch (error) {
          console.error('❌ 폴링 에러:', error);
        }
        
        scheduleNextPoll();
      }, remainingTime);
    };

    scheduleNextPoll();

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [pollStatus, loadChannelModes]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && selectedDevice) {
        pollStatus();
        loadChannelModes();
      }
    };
  
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pollStatus, loadChannelModes, selectedDevice]);

  const addScheduleEntryAllChannels = useCallback(() => {
    let addedCount = 0;
    let skippedByLimit = 0;
    let skippedByDuplicate = 0;
    
    setNpnSchedules((prev: NPNChannelSchedule[]) => {
      return prev.map((schedule: NPNChannelSchedule) => {
        if (schedule.schedules.length >= 3) {
          skippedByLimit++;
          return { ...schedule, enabled: true };
        }
        const exists = schedule.schedules.some((s: NPNScheduleEntry) => 
          s.start === bulkStartTime && s.end === bulkEndTime
        );
        if (exists) {
          skippedByDuplicate++;
          return { ...schedule, enabled: true };
        }
        addedCount++;
        return {
          ...schedule,
          enabled: true,
          schedules: [
            ...schedule.schedules,
            { start: bulkStartTime, end: bulkEndTime, enabled: true }
          ]
        };
      });
    });
    
    const messages: string[] = [];
    if (addedCount > 0) messages.push(`${addedCount}개 채널에 ${bulkStartTime}–${bulkEndTime} 스케줄을 추가했습니다.`);
    if (skippedByLimit > 0) messages.push(`${skippedByLimit}개 채널은 최대 3개 제한으로 건너뜀`);
    if (skippedByDuplicate > 0) messages.push(`${skippedByDuplicate}개 채널은 동일 스케줄이 이미 있어 건너뜀`);
    
    if (messages.length > 0) {
      toast.success(messages.join(' · '));
    } else {
      toast.warn('추가할 수 있는 채널이 없습니다.');
    }
  }, [bulkStartTime, bulkEndTime, setNpnSchedules]);

  const saveNpnSchedules = async () => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    setLoading(true);
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      await apiCall(`${BASE_URL}/npn-schedules/${id}`, {
        method: 'POST',
        body: JSON.stringify({ schedules: npnSchedules }),
      });

      toast.success('NPN 스케줄이 저장되었습니다');
    } catch (e: any) {
      toast.error(`스케줄 저장 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addScheduleEntry = (channelIndex: number) => {
    setNpnSchedules(prev => {
      const currentSchedules = prev[channelIndex].schedules;
      
      if (currentSchedules.length >= 3) {
        toast.warn('각 채널당 최대 3개의 스케줄만 설정할 수 있습니다.');
        return prev;
      }
      
      const newSchedules = prev.map((schedule, index) => {
        if (index === channelIndex) {
          return {
            ...schedule,
            schedules: [
              ...schedule.schedules,
              {
                start: '06:00',
                end: '18:00',
                enabled: true
              }
            ]
          };
        }
        return schedule;
      });
      return newSchedules;
    });
  };

  const removeScheduleEntry = (channelIndex: number, entryIndex: number) => {
    setNpnSchedules(prev => {
      const newSchedules = prev.map((schedule, chIndex) => {
        if (chIndex === channelIndex) {
          return {
            ...schedule,
            schedules: schedule.schedules.filter((_, entIndex) => entIndex !== entryIndex)
          };
        }
        return schedule;
      });
      return newSchedules;
    });
  };

  const deleteAllNpnSchedules = async () => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    if (!window.confirm('모든 NPN 스케줄을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    setLoading(true);
    try {
      const id = encodeURIComponent(selectedDevice.device_id);
      await apiCall(`${BASE_URL}/npn-schedules/${id}`, {
        method: 'DELETE',
      });

      setNpnSchedules(Array.from({ length: 12 }, (_, i) => ({
        channel: i,
        enabled: false,
        schedules: []
      })));

      toast.success('모든 NPN 스케줄이 삭제되었습니다');
    } catch (e: any) {
      toast.error(`스케줄 삭제 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateScheduleEntry = (channelIndex: number, entryIndex: number, field: string, value: any) => {
    setNpnSchedules(prev => {
      const newSchedules = prev.map((schedule, chIndex) => {
        if (chIndex === channelIndex) {
          return {
            ...schedule,
            schedules: schedule.schedules.map((entry, entIndex) => {
              if (entIndex === entryIndex) {
                return {
                  ...entry,
                  [field]: value
                };
              }
              return entry;
            })
          };
        }
        return schedule;
      });
      return newSchedules;
    });
  };

  const toggleChannelEnabled = (channelIndex: number) => {
    setNpnSchedules(prev => {
      const newSchedules = prev.map((schedule, index) => {
        if (index === channelIndex) {
          return {
            ...schedule,
            enabled: !schedule.enabled
          };
        }
        return schedule;
      });
      return newSchedules;
    });
  };

  const sendUnoCommand = async (command: string, channel?: number) => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    setLoading(true);
    try {
      const payload: any = {
        uno_command: command.toUpperCase()
      };

      if (channel !== undefined && channel >= 0) {
        payload.channel = channel;
      }

      await apiCall(`${BASE_URL}/modbus/${encodeURIComponent(selectedDevice.device_id)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.info(`🚀 UNO ${command} 명령 전송됨 - ACK 대기 중...`, {
        autoClose: 2000,
        hideProgressBar: false
      });

      setTimeout(() => {
        pollStatus();
      }, 500);
      
      if (command === 'ALLOFF') {
        setUnoChannels(Array(10).fill(false));
      } else if (command === 'ON' && typeof channel === 'number') {
        setUnoChannels(prev => {
          const next = [...prev];
          next[channel] = true;
          return next;
        });
      } else if (command === 'OFF' && typeof channel === 'number') {
        setUnoChannels(prev => {
          const next = [...prev];
          next[channel] = false;
          return next;
        });
      }
    } catch (e: any) {
      toast.error(`UNO 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendNpn = async (command: 'ON' | 'OFF' | 'ALL_OFF', channel?: number) => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    setLoading(true);
    try {
      const payload = command === 'ALL_OFF' ? { command } : { command, channel };
      await apiCall(`${BASE_URL}/npn/${encodeURIComponent(selectedDevice.device_id)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success(`⚡ NPN ${command} 전송됨`, {
        autoClose: 2000,
        hideProgressBar: false
      });
      
      setTimeout(() => {
        pollStatus();
      }, 500);

      if (command === 'ALL_OFF') {
        setNpnStates(Array(12).fill(false));
      } else if (typeof channel === 'number') {
        setNpnStates(prev => {
          const next = [...prev];
          next[channel] = command === 'ON';
          return next;
        });
      }
    } catch (e: any) {
      toast.error(`NPN 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendNutrient = async (command?: string, settings?: Partial<NutrientSettings>, schedule?: Partial<NutrientSchedule>) => {
    if (!selectedDevice) return toast.warn('장치를 선택하세요');

    setLoading(true);
    try {
      const payload: any = {};
      if (command) payload.command = command;
      if (settings) {
        payload.settings = {
          target_ph: Number(settings.target_ph),
          target_ec: Number(settings.target_ec),
          error_ph: Number(settings.error_ph),
          error_ec: Number(settings.error_ec),
          supply_time: Number(settings.supply_time),
          cycle_time: Number(settings.cycle_time),
          bed_a: settings.bed_a,
          bed_b: settings.bed_b,
          bed_c: settings.bed_c,
          bed_d: settings.bed_d,
        };
      }
      if (schedule) payload.schedule = schedule;

      await apiCall(`${BASE_URL}/nutrient/${encodeURIComponent(selectedDevice.device_id)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      toast.success('💧 양액 명령 전송됨', {
        autoClose: 2000,
        hideProgressBar: false
      });
      
      setTimeout(() => {
        pollStatus();
      }, 500);
    } catch (e: any) {
      toast.error(`양액 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImmediateOnce = () => {
    const onceSchedule = {
      ...nutrientSchedule,
      time_based_enabled: 0,
      once_based_enabled: 1,
      daily_based_enabled: 0
    };
    sendNutrient('START', nutrientSettings, onceSchedule);
  };

  const handleSaveAndStart = () => {
    const scheduleMode = {
      ...nutrientSchedule,
      time_based_enabled: nutrientSchedule.time_based_enabled,
      once_based_enabled: 0,
      daily_based_enabled: 1
    };
    sendNutrient(undefined, nutrientSettings, scheduleMode);
  };

  // 모바일 장치 선택 핸들러
  const handleMobileDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    console.log('📱 모바일에서 장치 선택:', deviceId);
    
    if (!deviceId) {
      console.log('❌ 빈 값 선택됨');
      return;
    }
    
    const device = devices.find(d => d.device_id === deviceId);
    console.log('✅ 찾은 장치:', device);
    
    if (device) {
      setSelectedDevice(device);
    }
  };

  // 데스크톱 장치 선택 핸들러
  const handleDesktopDeviceClick = (device: Device) => {
    console.log('🖥️ 데스크톱에서 장치 선택:', device);
    setSelectedDevice(device);
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '100%', margin: '0 auto', background: 'bg-gray-50', minHeight: '100%' }} className="responsive-container">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#1a202c' }}>양액 제어 시스템</h2>
      </div>

      {/* 모바일 장치 선택 */}
      <div className="mobile-device-selector">
        <div style={{ 
          background: '#fff', 
          borderRadius: 12, 
          padding: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #e2e8f0',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2d3748' }}>장치 선택</h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              background: mqttConnected ? '#d4f4dd' : '#fed7d7',
              color: mqttConnected ? '#22543d' : '#742a2a'
            }}>
              <span style={{ fontSize: 8 }}>{mqttConnected ? '●' : '○'}</span>
              <span>{mqttConnected ? '연결됨' : '연결 안됨'}</span>
            </div>
          </div>

          {devices.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '30px 16px', 
              color: '#a0aec0',
              fontSize: 13
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
              <div>등록된 장치가 없습니다</div>
            </div>
          ) : (
            <>
              <select
                value={selectedDevice?.device_id || ''}
                onChange={handleMobileDeviceChange}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  outline: 'none',
                  background: '#fff',
                  color: '#2d3748'
                }}
              >
                <option value="">장치를 선택하세요</option>
                {devices.map(device => (
                  <option key={device.device_id} value={device.device_id}>
                    {device.device_name}
                  </option>
                ))}
              </select>

              {selectedDevice && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: '#f7fafc',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#718096',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}>
                  ID: {selectedDevice.device_id}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24 }} className="main-layout">
        {/* 왼쪽 사이드바 - 장치 목록 (데스크톱) */}
        <div style={{ width: 280, flexShrink: 0 }} className="desktop-sidebar">
          <div style={{ 
            background: '#fff', 
            borderRadius: 12, 
            padding: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            position: 'sticky',
            top: 24
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2d3748' }}>장치 목록</h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                background: mqttConnected ? '#d4f4dd' : '#fed7d7',
                color: mqttConnected ? '#22543d' : '#742a2a'
              }}>
                <span style={{ fontSize: 8 }}>{mqttConnected ? '●' : '○'}</span>
                <span>{mqttConnected ? '연결됨' : '연결 안됨'}</span>
              </div>
            </div>

            {devices.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '30px 16px', 
                color: '#a0aec0',
                fontSize: 13
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div>등록된 장치가 없습니다</div>
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 8,
                maxHeight: 'calc(100vh - 220px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: 4
              }}>
                {devices.map(device => (
                  <div
                    key={device.device_id}
                    onClick={() => handleDesktopDeviceClick(device)}
                    style={{
                      padding: 12,
                      border: selectedDevice?.device_id === device.device_id ? '2px solid #4299e1' : '1px solid #e2e8f0',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: selectedDevice?.device_id === device.device_id ? '#ebf8ff' : '#fff',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    {selectedDevice?.device_id === device.device_id && (
                      <div style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#4299e1',
                        boxShadow: '0 0 0 2px #ebf8ff'
                      }} />
                    )}
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#2d3748', marginBottom: 4 }}>
                      {device.device_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#718096', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {device.device_id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 메인 컨텐츠 영역 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedDevice ? (
            <div style={{ 
              background: '#fff',
              borderRadius: 12,
              padding: 60,
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e2e8f0'
            }} className="no-device-placeholder">
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
              <div style={{ fontSize: 18, color: '#718096', fontWeight: 500 }}>
                장치를 선택하세요
              </div>
            </div>
          ) : (
            <div>
              {/* 선택된 장치 정보 헤더 */}
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                padding: '16px 24px',
                marginBottom: 16,
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }} className="device-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#48bb78',
                    boxShadow: '0 0 0 3px rgba(72, 187, 120, 0.3)',
                    animation: 'pulse 2s infinite'
                  }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>
                      현재 선택된 장치
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                      {selectedDevice.device_name}
                    </div>
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontWeight: 600
                }} className="device-id-badge">
                  {selectedDevice.device_id}
                </div>
              </div>

              {/* 탭 네비게이션 */}
              <div style={{
                background: '#fff',
                borderRadius: 12,
                padding: '8px',
                marginBottom: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: 8
              }} className="tab-navigation">
                {[
                  { key: 'nutrient' as const, label: '양액 제어', icon: '🧪' },
                  { key: 'npn' as const, label: 'NPN 제어', icon: '⚡' },
                  { key: 'uno' as const, label: 'UNO 제어', icon: '🤖' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: activeTab === tab.key ? '#4299e1' : 'transparent',
                      color: activeTab === tab.key ? '#fff' : '#4a5568',
                      transition: 'all 0.2s ease',
                      boxShadow: activeTab === tab.key ? '0 2px 4px rgba(66, 153, 225, 0.3)' : 'none'
                    }}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'nutrient' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ 
                    background: '#fff', 
                    borderRadius: 12, 
                    padding: 24,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0'
                  }}>
                    <h4 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 700, color: '#2d3748' }}>
                      🧪 양액 사이클 제어
                    </h4>

                    <div style={{ 
                      background: '#f7fafc', 
                      padding: 20, 
                      borderRadius: 10, 
                      marginBottom: 20,
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, color: '#2d3748' }}>
                        📊 양액 설정값
                      </div>
                      
                      <div className="nutrient-settings-grid" style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                        gap: 16,
                        marginBottom: 20
                      }}>
                        {[
                          { label: '목표 pH', key: 'target_ph' as keyof NutrientSettings, min: 0, max: 99, step: 0.1, unit: '' },
                          { label: '목표 EC', key: 'target_ec' as keyof NutrientSettings, min: 0, max: 99, step: 0.1, unit: '' },
                          { label: 'pH 오차율', key: 'error_ph' as keyof NutrientSettings, min: 0, max: 50, step: 0.1, unit: '%' },
                          { label: 'EC 오차율', key: 'error_ec' as keyof NutrientSettings, min: 0, max: 50, step: 0.1, unit: '%' },
                          { label: '관수시간', key: 'supply_time' as keyof NutrientSettings, min: 1, max: 100, step: 0.1, unit: '분' },
                          { label: '사이클간격', key: 'cycle_time' as keyof NutrientSettings, min: 1, max: 1000, step: 0.1, unit: '시간' }
                        ].map(field => (
                          <div key={field.key}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: 6 }}>
                              {field.label}
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                value={nutrientSettings[field.key]}
                                onChange={(e) => setNutrientSettings({ ...nutrientSettings, [field.key]: e.target.value })}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  outline: 'none'
                                }}
                              />
                              {field.unit && (
                                <span style={{ fontSize: 13, color: '#718096', minWidth: 30 }}>
                                  {field.unit}
                                </span>
                              )}
                            </div>
                            <small style={{ fontSize: 11, color: '#a0aec0', marginTop: 4, display: 'block' }}>
                              {field.max === 99 ? `${field.min}~${field.max} (99=건너뛰기)` : `최소: ${field.min}${field.unit}`}
                            </small>
                          </div>
                        ))}
                      </div>

                      {(Number(nutrientSettings.target_ph) === 99 || Number(nutrientSettings.target_ec) === 99) && (
                        <div style={{
                          background: '#fef5e7',
                          border: '1px solid #f9e79f',
                          padding: 12,
                          borderRadius: 8,
                          fontSize: 13,
                          color: '#856404',
                          marginBottom: 16,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}>
                          <span>⚠️</span>
                          <span>
                            {Number(nutrientSettings.target_ph) === 99 && 'pH'}
                            {Number(nutrientSettings.target_ph) === 99 && Number(nutrientSettings.target_ec) === 99 && ', '}
                            {Number(nutrientSettings.target_ec) === 99 && 'EC'} 
                            {' '}제어가 건너뛰기로 설정되었습니다
                          </span>
                        </div>
                      )}

                      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15, color: '#2d3748' }}>
                        🎯 관수 베드 선택
                      </div>
                      <div className="bed-selection-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                        {(['bed_a', 'bed_b', 'bed_c', 'bed_d'] as const).map((bed, idx) => (
                          <label key={bed} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: 12,
                            background: nutrientSettings[bed] === 1 ? '#e6fffa' : '#fff',
                            border: `2px solid ${nutrientSettings[bed] === 1 ? '#2c7a7b' : '#e2e8f0'}`,
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#2d3748',
                            transition: 'all 0.2s'
                          }}>
                            <input
                              type="checkbox"
                              checked={nutrientSettings[bed] === 1}
                              onChange={(e) => setNutrientSettings({ 
                                ...nutrientSettings, 
                                [bed]: e.target.checked ? 1 : 0 
                              })}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            베드 {String.fromCharCode(65 + idx)}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div style={{ 
                      background: '#f7fafc', 
                      padding: 20, 
                      borderRadius: 10, 
                      marginBottom: 20,
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, color: '#2d3748' }}>
                        ⏰ 스케줄 설정
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: 12,
                          background: nutrientSchedule.time_based_enabled ? '#e6fffa' : '#fff',
                          border: `2px solid ${nutrientSchedule.time_based_enabled ? '#2c7a7b' : '#e2e8f0'}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600
                        }}>
                          <input
                            type="checkbox"
                            checked={Boolean(nutrientSchedule.time_based_enabled)}
                            onChange={(e) => setNutrientSchedule({ 
                              ...nutrientSchedule, 
                              time_based_enabled: e.target.checked ? 1 : 0 
                            })}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          시간 기반 스케줄 활성화
                        </label>
                      </div>

                      {Boolean(nutrientSchedule.time_based_enabled) && (
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <div>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: 6 }}>
                              시작 시간
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <select
                                value={nutrientSchedule.start_hour}
                                onChange={(e) => setNutrientSchedule({ ...nutrientSchedule, start_hour: Number(e.target.value) })}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  outline: 'none'
                                }}
                              >
                                {hours24.map(h => (
                                  <option key={h} value={h}>{h.toString().padStart(2, '0')}시</option>
                                ))}
                              </select>
                              <select
                                value={nutrientSchedule.start_minute}
                                onChange={(e) => setNutrientSchedule({ ...nutrientSchedule, start_minute: Number(e.target.value) })}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  outline: 'none'
                                }}
                              >
                                {minutes5.map(m => (
                                  <option key={m} value={m}>{m.toString().padStart(2, '0')}분</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#4a5568', display: 'block', marginBottom: 6 }}>
                              종료 시간
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <select
                                value={nutrientSchedule.end_hour}
                                onChange={(e) => setNutrientSchedule({ ...nutrientSchedule, end_hour: Number(e.target.value) })}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  outline: 'none'
                                }}
                              >
                                {hours24.map(h => (
                                  <option key={h} value={h}>{h.toString().padStart(2, '0')}시</option>
                                ))}
                              </select>
                              <select
                                value={nutrientSchedule.end_minute}
                                onChange={(e) => setNutrientSchedule({ ...nutrientSchedule, end_minute: Number(e.target.value) })}
                                style={{
                                  padding: '8px 12px',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: 6,
                                  fontSize: 14,
                                  outline: 'none'
                                }}
                              >
                                {minutes5.map(m => (
                                  <option key={m} value={m}>{m.toString().padStart(2, '0')}분</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {[
                        { label: '즉시 1회 실행', icon: '▶️', color: '#38a169', action: handleImmediateOnce },
                        { label: '설정 저장 및 시작', icon: '💾', color: '#4299e1', action: handleSaveAndStart },
                        { label: '정지', icon: '⏹️', color: '#e53e3e', action: () => sendNutrient('STOP') },
                        { label: '리셋', icon: '🔄', color: '#ed8936', action: () => sendNutrient('RESET') }
                      ].map(btn => (
                        <button
                          key={btn.label}
                          onClick={btn.action}
                          disabled={loading}
                          style={{
                            flex: 1,
                            minWidth: 140,
                            background: btn.color,
                            color: '#fff',
                            border: 'none',
                            padding: '12px 20px',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: 14,
                            transition: 'all 0.2s'
                          }}
                        >
                          {btn.icon} {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ 
                    background: '#fff',
                    padding: 24,
                    borderRadius: 12,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2d3748' }}>
                        🔄 양액 사이클 상태
                      </h4>
                      <div style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        background: nutrientCycleStatus.isActive ? '#c6f6d5' : '#fed7d7',
                        color: nutrientCycleStatus.isActive ? '#22543d' : '#742a2a',
                        border: `1px solid ${nutrientCycleStatus.isActive ? '#9ae6b4' : '#fc8181'}`
                      }}>
                        {nutrientCycleStatus.isActive ? '● 활성' : '○ 비활성'}
                      </div>
                    </div>

                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                      gap: 16, 
                      marginBottom: 20 
                    }}>
                      {[
                        { 
                          label: '현재 상태', 
                          value: getCycleStatusText(nutrientCycleStatus.cycle),
                          sub: `사이클 ${nutrientCycleStatus.cycle === -1 ? '-' : nutrientCycleStatus.cycle}`,
                          color: getStatusColor(nutrientCycleStatus.cycleStatus)
                        },
                        { 
                          label: '경과 시간', 
                          value: formatElapsedTime(nutrientCycleStatus.elapsedTime),
                          sub: '시작부터 현재까지',
                          color: '#4a5568'
                        },
                        { 
                          label: '남은 시간', 
                          value: formatRemainingTime(nutrientCycleStatus.remainingTime),
                          sub: '완료까지 예상',
                          color: '#4a5568'
                        }
                      ].map(item => (
                        <div key={item.label} style={{
                          background: '#f7fafc',
                          padding: 16,
                          borderRadius: 10,
                          textAlign: 'center',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{ fontSize: 12, color: '#718096', marginBottom: 8, fontWeight: 600 }}>
                            {item.label}
                          </div>
                          <div style={{ 
                            fontWeight: 700, 
                            fontSize: 18,
                            color: item.color,
                            marginBottom: 4
                          }}>
                            {item.value}
                          </div>
                          <div style={{ fontSize: 11, color: '#a0aec0' }}>
                            {item.sub}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: 16,
                      background: '#f7fafc',
                      padding: 20,
                      borderRadius: 10,
                      border: '1px solid #e2e8f0'
                    }}>
                      {[
                        { label: 'pH', value: nutrientCycleStatus.currentPH, target: Number(nutrientSettings.target_ph), error: Number(nutrientSettings.error_ph) },
                        { label: 'EC', value: nutrientCycleStatus.currentEC, target: Number(nutrientSettings.target_ec), error: Number(nutrientSettings.error_ec) }
                      ].map(metric => {
                        const isInRange = Math.abs(metric.value - metric.target) <= (metric.target * metric.error / 100);
                        return (
                          <div key={metric.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#718096', marginBottom: 8, fontWeight: 600 }}>
                              현재 {metric.label}
                            </div>
                            <div style={{ 
                              fontSize: 32, 
                              fontWeight: 700, 
                              color: isInRange ? '#38a169' : '#e53e3e'
                            }}>
                              {metric.value.toFixed(1)}
                            </div>
                            <div style={{ fontSize: 11, color: '#a0aec0' }}>
                              목표: {metric.target === 99 ? '건너뛰기' : metric.target.toFixed(1)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'npn' && (
                <div style={{ 
                  background: '#fff',
                  padding: 24,
                  borderRadius: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2d3748' }}>
                      ⚡ NPN 모듈 제어
                    </h4>
                    <button
                      onClick={() => setShowNpnScheduler(!showNpnScheduler)}
                      style={{
                        background: showNpnScheduler ? '#e53e3e' : '#38a169',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: 13,
                        transition: 'all 0.2s'
                      }}
                    >
                      {showNpnScheduler ? '❌ 스케줄러 닫기' : '⏰ 스케줄러 열기'}
                    </button>
                  </div>

                  {activeSchedules.length > 0 && (
                    <div style={{
                      background: '#bee3f8',
                      border: '1px solid #90cdf4',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 16,
                      fontSize: 13,
                      color: '#1a365d',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <span style={{ fontSize: 16 }}>🟢</span>
                      <span>
                        <strong>현재 활성 스케줄:</strong> {activeSchedules
                          .filter(s => s.channel !== null && s.channel !== undefined)
                          .map(s => `CH${s.channel}`)
                          .join(', ') || '없음'
                        }
                      </span>
                    </div>
                  )}

                  {showNpnScheduler && (
                    <div style={{
                      background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                      padding: 20,
                      borderRadius: 10,
                      marginBottom: 20
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h5 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2d3748' }}>📅 NPN 스케줄 설정</h5>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={deleteAllNpnSchedules}
                            disabled={loading}
                            style={{
                              background: '#e53e3e',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: 13
                            }}
                          >
                            🗑️ 전체 삭제
                          </button>
                          <button
                            onClick={saveNpnSchedules}
                            disabled={loading}
                            style={{
                              background: '#4299e1',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: 13
                            }}
                          >
                            💾 스케줄 저장
                          </button>
                        </div>
                      </div>

                      <div style={{
                        background: '#fff',
                        border: '1px solid #cbd5e0',
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 16
                      }}>
                        <h6 style={{ margin: '0 0 12px 0', color: '#4a5568', fontSize: 14, fontWeight: 600 }}>
                          🕐 전체 채널에 시간 추가
                        </h6>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: '#4a5568' }}>시작:</label>
                          <input
                            type="time"
                            value={bulkStartTime}
                            onChange={(e) => setBulkStartTime(e.target.value)}
                            style={{
                              padding: '8px 12px',
                              border: '1px solid #cbd5e0',
                              borderRadius: 6,
                              fontSize: 14,
                              outline: 'none'
                            }}
                          />
                          <label style={{ fontSize: 13, fontWeight: 600, color: '#4a5568' }}>종료:</label>
                          <input
                            type="time"
                            value={bulkEndTime}
                            onChange={(e) => setBulkEndTime(e.target.value)}
                            style={{
                              padding: '8px 12px',
                              border: '1px solid #cbd5e0',
                              borderRadius: 6,
                              fontSize: 14,
                              outline: 'none'
                            }}
                          />
                          <button
                            onClick={addScheduleEntryAllChannels}
                            disabled={loading}
                            style={{
                              background: '#38b2ac',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: 13
                            }}
                          >
                            + 전체 채널에 추가
                          </button>
                        </div>
                        <div style={{ fontSize: 12, color: '#718096' }}>
                          💡 팁: 이미 3개 스케줄이 있는 채널이나 동일한 시간이 있는 채널은 자동으로 건너뜁니다.
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {npnSchedules.map((channelSchedule, channelIndex) => (
                          <div key={channelIndex} style={{
                            border: '1px solid #cbd5e0',
                            borderRadius: 8,
                            padding: 12,
                            background: channelSchedule.enabled ? '#f0fff4' : '#fff'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                                <input
                                  type="checkbox"
                                  checked={channelSchedule.enabled}
                                  onChange={() => toggleChannelEnabled(channelIndex)}
                                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                                />
                                채널 {channelIndex}
                              </label>
                              <button
                                onClick={() => addScheduleEntry(channelIndex)}
                                disabled={!channelSchedule.enabled || channelSchedule.schedules.length >= 3}
                                style={{
                                  background: (!channelSchedule.enabled || channelSchedule.schedules.length >= 3) ? '#cbd5e0' : '#38a169',
                                  color: '#fff',
                                  border: 'none',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  cursor: (!channelSchedule.enabled || channelSchedule.schedules.length >= 3) ? 'not-allowed' : 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                + 추가 ({channelSchedule.schedules.length}/3)
                              </button>
                            </div>

                            {channelSchedule.enabled && channelSchedule.schedules.map((schedule, entryIndex) => (
                              <div key={entryIndex} style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'center',
                                marginBottom: 6,
                                padding: 8,
                                background: '#fff',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={schedule.enabled}
                                  onChange={(e) => updateScheduleEntry(channelIndex, entryIndex, 'enabled', e.target.checked)}
                                  style={{ width: 14, height: 14, cursor: 'pointer' }}
                                />
                                
                                <div style={{ display: 'flex', gap: 2, alignItems: 'center', fontSize: 12 }}>
                                  <select
                                    value={parseInt(schedule.start.split(':')[0])}
                                    onChange={(e) => {
                                      const hour = e.target.value.padStart(2, '0');
                                      const minute = schedule.start.split(':')[1] || '00';
                                      updateScheduleEntry(channelIndex, entryIndex, 'start', `${hour}:${minute}`);
                                    }}
                                    style={{ padding: 4, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 11, width: 45 }}
                                  >
                                    {hours24.map((h) => (
                                      <option key={h} value={h}>
                                        {h.toString().padStart(2, '0')}
                                      </option>
                                    ))}
                                  </select>
                                  :
                                  <select
                                    value={parseInt(schedule.start.split(':')[1]) || 0}
                                    onChange={(e) => {
                                      const hour = schedule.start.split(':')[0] || '00';
                                      const minute = e.target.value.padStart(2, '0');
                                      updateScheduleEntry(channelIndex, entryIndex, 'start', `${hour}:${minute}`);
                                    }}
                                    style={{ padding: 4, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 11, width: 45 }}
                                  >
                                    {minutes60.map((m) => (
                                      <option key={m} value={m}>
                                        {m.toString().padStart(2, '0')}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                
                                <span style={{ fontSize: 11 }}>~</span>
                                
                                <div style={{ display: 'flex', gap: 2, alignItems: 'center', fontSize: 12 }}>
                                  <select
                                    value={parseInt(schedule.end.split(':')[0])}
                                    onChange={(e) => {
                                      const hour = e.target.value.padStart(2, '0');
                                      const minute = schedule.end.split(':')[1] || '00';
                                      updateScheduleEntry(channelIndex, entryIndex, 'end', `${hour}:${minute}`);
                                    }}
                                    style={{ padding: 4, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 11, width: 45 }}
                                  >
                                    {hours24.map((h) => (
                                      <option key={h} value={h}>
                                        {h.toString().padStart(2, '0')}
                                      </option>
                                    ))}
                                  </select>
                                  :
                                  <select
                                    value={parseInt(schedule.end.split(':')[1]) || 0}
                                    onChange={(e) => {
                                      const hour = schedule.end.split(':')[0] || '00';
                                      const minute = e.target.value.padStart(2, '0');
                                      updateScheduleEntry(channelIndex, entryIndex, 'end', `${hour}:${minute}`);
                                    }}
                                    style={{ padding: 4, border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 11, width: 45 }}
                                  >
                                    {minutes60.map((m) => (
                                      <option key={m} value={m}>
                                        {m.toString().padStart(2, '0')}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                
                                <button
                                  onClick={() => removeScheduleEntry(channelIndex, entryIndex)}
                                  style={{
                                    background: '#e53e3e',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    marginLeft: 'auto'
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}

                            {channelSchedule.enabled && channelSchedule.schedules.length === 0 && (
                              <div style={{ fontSize: 12, color: '#a0aec0', textAlign: 'center', padding: 12 }}>
                                시간 설정이 없습니다
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                      <button
                        onClick={() => sendNpn('ALL_OFF')}
                        disabled={loading}
                        style={{ 
                          background: '#e53e3e', 
                          color: '#fff', 
                          border: 'none', 
                          padding: '10px 20px', 
                          borderRadius: 8, 
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        전체 OFF
                      </button>
                      <button
                        onClick={setAutoMode}
                        disabled={loading}
                        style={{ 
                          background: '#4299e1', 
                          color: '#fff', 
                          border: 'none', 
                          padding: '10px 20px', 
                          borderRadius: 8, 
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        자동 모드 설정
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} style={{
                          border: '1px solid #e2e8f0',
                          padding: 12,
                          borderRadius: 8,
                          textAlign: 'center',
                          background: npnStates[i] ? '#f0fff4' : '#fff'
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 15, color: '#2d3748' }}>CH {i}</div>
                          <div style={{ 
                            fontSize: 10, 
                            color: channelModes[i] === 'manual' ? '#e53e3e' : '#38a169', 
                            marginBottom: 6,
                            fontWeight: 600
                          }}>
                            {channelModes[i] === 'manual' ? 'MANUAL' : 'AUTO'}
                          </div>
                          <div style={{
                            fontSize: 13,
                            color: npnStates[i] ? '#38a169' : '#a0aec0',
                            marginBottom: 10,
                            fontWeight: 700
                          }}>
                            {npnStates[i] ? 'ON' : 'OFF'}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => sendNpn('ON', i)}
                              disabled={loading}
                              style={{
                                flex: 1,
                                background: npnStates[i] ? '#38a169' : '#cbd5e0',
                                color: '#fff',
                                border: 'none',
                                padding: '6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              ON
                            </button>
                            <button
                              onClick={() => sendNpn('OFF', i)}
                              disabled={loading}
                              style={{
                                flex: 1,
                                background: !npnStates[i] ? '#e53e3e' : '#cbd5e0',
                                color: '#fff',
                                border: 'none',
                                padding: '6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              OFF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'uno' && (
                <div style={{ 
                  background: '#fff',
                  padding: 24,
                  borderRadius: 12,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: '1px solid #e2e8f0'
                }}>
                  <h4 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 700, color: '#2d3748' }}>
                    🤖 UNO 제어
                  </h4>

                  <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => sendUnoCommand('ALLOFF')}
                      disabled={loading}
                      style={{
                        background: '#718096',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: 8,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      ⏸️ 전체 OFF
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <div key={i} style={{
                        border: '1px solid #e2e8f0',
                        padding: 12,
                        borderRadius: 8,
                        textAlign: 'center',
                        background: unoChannels[i] ? '#e6fffa' : '#fff'
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15, color: '#2d3748' }}>CH{i}</div>
                        <div style={{
                          fontSize: 13,
                          color: unoChannels[i] ? '#2c7a7b' : '#a0aec0',
                          marginBottom: 10,
                          fontWeight: 700
                        }}>
                          {unoChannels[i] ? 'ON' : 'OFF'}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => sendUnoCommand('ON', i)}
                            disabled={loading}
                            style={{
                              flex: 1,
                              background: unoChannels[i] ? '#2c7a7b' : '#cbd5e0',
                              color: '#fff',
                              border: 'none',
                              padding: '6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ON
                          </button>
                          <button
                            onClick={() => sendUnoCommand('OFF', i)}
                            disabled={loading}
                            style={{
                              flex: 1,
                              background: !unoChannels[i] ? '#e53e3e' : '#cbd5e0',
                              color: '#fff',
                              border: 'none',
                              padding: '6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            OFF
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        /* 기본 상태 - 모바일 선택기 숨김 */
        .mobile-device-selector {
          display: none;
        }

        /* 데스크톱 (기본) */
        @media (min-width: 769px) {
          .mobile-device-selector {
            display: none !important;
          }
          .desktop-sidebar {
            display: block !important;
          }
        }

        /* 모바일 */
        @media screen and (max-width: 768px) {
          .responsive-container {
            padding: 12px !important;
          }
          .responsive-container h2 {
            font-size: 20px !important;
            margin-bottom: 16px !important;
          }
          .main-layout {
            display: block !important;
            gap: 0 !important;
          }
          .desktop-sidebar {
            display: none !important;
          }
          .mobile-device-selector {
            display: block !important;
          }
          .device-header {
            padding: 12px 16px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
          .device-id-badge {
            padding: 6px 12px !important;
            font-size: 11px !important;
            align-self: stretch !important;
            text-align: center !important;
          }
          .tab-navigation {
            padding: 6px !important;
            gap: 6px !important;
          }
          .tab-navigation button {
            padding: 10px 8px !important;
            font-size: 13px !important;
          }
          .no-device-placeholder {
            padding: 40px 20px !important;
            margin: 16px 0 !important;
          }
          .no-device-placeholder div:first-child {
            font-size: 36px !important;
          }
          .no-device-placeholder div:last-child {
            font-size: 16px !important;
          }
          /* 메인 컨텐츠 영역이 제대로 보이도록 */
          .main-layout > div:last-child {
            width: 100% !important;
            flex: none !important;
            min-width: 100% !important;
          }
        }

        /* 모바일 (500px 이하) - 양액 설정값 2열로 표시 */
        @media screen and (max-width: 500px) {
          .nutrient-settings-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
        }

        /* 관수 베드 선택 - 450px-562px 구간에서 2열로 강제 (A B / C D) */
        @media screen and (min-width: 450px) and (max-width: 562px) {
          .bed-selection-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ModbusControlTest;