// components/ModbusControl.tsx
import React, { useState, useEffect } from 'react';

interface ModbusControlProps {
  deviceId: string;
}

interface CommandResponse {
  slaveId: number;
  functionCode: number;
  address: number;
  value: number;
  success: boolean;
  timestamp: string;
  receivedAt: string;
}

const ModbusControl: React.FC<ModbusControlProps> = ({ deviceId }) => {
  const [slaveId, setSlaveId] = useState(1);
  const [functionCode, setFunctionCode] = useState(5);
  const [address, setAddress] = useState(1);
  const [value, setValue] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [latestResponse, setLatestResponse] = useState<CommandResponse | null>(null);
  const [mqttStatus, setMqttStatus] = useState<boolean>(false);

  // MQTT 상태 확인
  useEffect(() => {
    const checkMqttStatus = async () => {
      try {
        const response = await fetch('/api/modbus/mqtt-status', {
          credentials: 'include'
        });
        const result = await response.json();
        setMqttStatus(result.connected);
      } catch (error) {
        setMqttStatus(false);
      }
    };

    checkMqttStatus();
    const interval = setInterval(checkMqttStatus, 10000); // 10초마다 확인
    return () => clearInterval(interval);
  }, []);

  // 최근 응답 확인
  useEffect(() => {
    const checkLatestResponse = async () => {
      try {
        const response = await fetch(`/api/modbus/responses/${deviceId}`, {
          credentials: 'include'
        });
        const result = await response.json();
        if (result.success && result.latestResponse) {
          setLatestResponse(result.latestResponse);
        }
      } catch (error) {
        console.error('응답 확인 실패:', error);
      }
    };

    checkLatestResponse();
    const interval = setInterval(checkLatestResponse, 5000); // 5초마다 확인
    return () => clearInterval(interval);
  }, [deviceId]);

  const sendCommand = async () => {
    setSending(true);
    setMessage('');
    
    try {
      const response = await fetch(`/api/modbus/send-command/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slaveId, functionCode, address, value })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage('✅ 명령이 전송되었습니다!');
      } else {
        setMessage('❌ ' + result.error);
      }
    } catch (error) {
      setMessage('❌ 네트워크 오류');
    } finally {
      setSending(false);
    }
  };

  const toggleLED = async (state: 'on' | 'off') => {
    setSending(true);
    
    try {
      const response = await fetch(`/api/modbus/led/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ state })
      });
      
      const result = await response.json();
      setMessage(result.success ? `✅ LED ${state}` : '❌ LED 제어 실패');
    } catch (error) {
      setMessage('❌ 네트워크 오류');
    } finally {
      setSending(false);
    }
  };

  const controlRelay = async (relay: number, state: 'on' | 'off') => {
    setSending(true);
    
    try {
      const response = await fetch(`/api/modbus/relay/${deviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ relay, state })
      });
      
      const result = await response.json();
      setMessage(result.success ? `✅ 릴레이 ${relay} ${state}` : '❌ 릴레이 제어 실패');
    } catch (error) {
      setMessage('❌ 네트워크 오류');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Modbus 제어</h3>
        <div className={`px-3 py-1 rounded text-sm ${
          mqttStatus ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          MQTT: {mqttStatus ? '연결됨' : '연결 안됨'}
        </div>
      </div>
      
      {/* LED 제어 */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">LED 제어</h4>
        <div className="flex gap-2">
          <button
            onClick={() => toggleLED('on')}
            disabled={sending || !mqttStatus}
            className="bg-green-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            LED ON
          </button>
          <button
            onClick={() => toggleLED('off')}
            disabled={sending || !mqttStatus}
            className="bg-red-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            LED OFF
          </button>
        </div>
      </div>

      {/* 릴레이 제어 */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">릴레이 제어</h4>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map(relay => (
            <div key={relay} className="flex gap-1">
              <span className="text-sm py-2 px-2 min-w-[60px]">릴레이 {relay}</span>
              <button
                onClick={() => controlRelay(relay, 'on')}
                disabled={sending || !mqttStatus}
                className="bg-blue-500 text-white px-2 py-1 rounded text-sm disabled:bg-gray-400"
              >
                ON
              </button>
              <button
                onClick={() => controlRelay(relay, 'off')}
                disabled={sending || !mqttStatus}
                className="bg-gray-500 text-white px-2 py-1 rounded text-sm disabled:bg-gray-400"
              >
                OFF
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {/* 수동 명령 */}
      <div className="mb-4">
        <h4 className="font-medium mb-2">수동 Modbus 명령</h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Slave ID</label>
            <input
              type="number"
              value={slaveId}
              onChange={(e) => setSlaveId(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
              min="1"
              max="255"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Function Code</label>
            <select
              value={functionCode}
              onChange={(e) => setFunctionCode(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
            >
              <option value={1}>1 - Read Coils</option>
              <option value={3}>3 - Read Holding Registers</option>
              <option value={5}>5 - Write Single Coil</option>
              <option value={6}>6 - Write Single Register</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <input
              type="number"
              value={address}
              onChange={(e) => setAddress(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Value</label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        
        <button
          onClick={sendCommand}
          disabled={sending || !mqttStatus}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium disabled:bg-gray-400"
        >
          {sending ? '전송 중...' : 'Modbus 명령 전송'}
        </button>
      </div>

      {/* 최근 응답 */}
      {latestResponse && (
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <h4 className="font-medium mb-2">최근 응답</h4>
          <div className="text-sm space-y-1">
            <div>상태: <span className={latestResponse.success ? 'text-green-600' : 'text-red-600'}>
              {latestResponse.success ? '성공' : '실패'}
            </span></div>
            <div>주소: {latestResponse.address}, 값: {latestResponse.value}</div>
            <div>시간: {new Date(latestResponse.receivedAt).toLocaleString()}</div>
          </div>
        </div>
      )}
      
      {/* 메시지 */}
      {message && (
        <div className="mt-4 p-3 rounded bg-gray-50 text-sm">
          {message}
        </div>
      )}
    </div>
  );
};

export default ModbusControl;