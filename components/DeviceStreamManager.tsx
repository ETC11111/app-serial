import React, { useState, useEffect } from 'react';

interface Stream {
    id: number;
    stream_name: string;
    rtsp_url: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

interface Device {
    device_id: string;
    device_name: string;
    admin_name?: string;
    device_location?: string;
    created_at: string;
    last_seen_at?: string;
}

interface Connection {
    stream_id: number;
    stream_name: string;
    device_id: string;
    device_name: string;
    connection_id: number;
    display_order: number;
    connected_at: string;
}

const DeviceStreamManager: React.FC = () => {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [selectedStream, setSelectedStream] = useState<number | null>(null);
    const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const getAuthHeaders = () => {
        const token = document.cookie
            .split('; ')
            .find(row => row.startsWith('accessToken='))
            ?.split('=')[1] || localStorage.getItem('accessToken');

        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    // 화면 크기 변경 감지
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 스트림 목록 조회
    const fetchStreams = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stream-devices`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                setStreams(data.streams);
            } else {
                setError('스트림 목록 조회 실패: ' + data.error);
            }
        } catch (error) {
            console.error('스트림 조회 실패:', error);
            setError('스트림 조회 중 오류가 발생했습니다.');
        }
    };

    // 장치 목록 조회
    const fetchDevices = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/devices/with-favorites`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                setDevices(data.devices);
            } else {
                setError('장치 목록 조회 실패: ' + data.error);
            }
        } catch (error) {
            console.error('장치 조회 실패:', error);
            setError('장치 조회 중 오류가 발생했습니다.');
        }
    };

    // 연결 상태 조회
    const fetchConnections = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/device-streams/connections/overview`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (data.success) {
                const allConnections: Connection[] = [];
                data.connections.forEach((stream: any) => {
                    stream.connected_devices.forEach((device: any) => {
                        allConnections.push({
                            stream_id: stream.stream_id,
                            stream_name: stream.stream_name,
                            device_id: device.device_id,
                            device_name: device.device_name,
                            connection_id: device.connection_id,
                            display_order: device.display_order,
                            connected_at: device.connected_at
                        });
                    });
                });
                setConnections(allConnections);
                console.log('📊 현재 연결 상태:', allConnections);
            } else {
                setError('연결 상태 조회 실패: ' + data.error);
            }
        } catch (error) {
            console.error('연결 상태 조회 실패:', error);
            setError('연결 상태 조회 중 오류가 발생했습니다.');
        }
    };

    // 스트림-장치 연결
    const handleConnect = async () => {
        if (!selectedStream || selectedDevices.length === 0) {
            alert('스트림과 장치를 선택해주세요.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log('🔗 연결 요청:', { streamId: selectedStream, deviceIds: selectedDevices });

            const response = await fetch(`${API_BASE}/api/device-streams/connect`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    streamId: selectedStream,
                    deviceIds: selectedDevices
                })
            });

            const data = await response.json();
            console.log('📡 연결 응답:', data);

            if (data.success) {
                alert(`연결이 완료되었습니다! (${data.connections.length}개 연결)`);
                fetchConnections();
                setSelectedDevices([]);
                setSelectedStream(null);
                if (isMobile) {
                    setActiveTab('list');
                }
            } else {
                setError(`연결 실패: ${data.error}`);
            }
        } catch (error) {
            console.error('연결 실패:', error);
            setError('연결 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 연결 해제
    const handleDisconnect = async (streamId: number, deviceId: string) => {
        if (!confirm('정말로 연결을 해제하시겠습니까?')) return;

        try {
            console.log('🔌 연결 해제 요청:', { streamId, deviceId });

            const response = await fetch(`${API_BASE}/api/device-streams/disconnect`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    streamId: streamId,
                    deviceIds: [deviceId]
                })
            });

            const data = await response.json();
            console.log('📡 해제 응답:', data);

            if (data.success) {
                alert('연결이 해제되었습니다.');
                fetchConnections();
            } else {
                setError(`해제 실패: ${data.error}`);
            }
        } catch (error) {
            console.error('해제 실패:', error);
            setError('해제 중 오류가 발생했습니다.');
        }
    };

    // 초기 데이터 로드
    useEffect(() => {
        fetchStreams();
        fetchDevices();
        fetchConnections();
    }, []);

    return (
        <div className="h-auto bg-white">
            <style>{`
                .scrollbar-hide {
                    -webkit-scrollbar: none;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
            {/* 헤더 */}
            <div className={`bg-white ${isMobile ? 'p-4' : 'p-6'}  sticky top-0 z-50`}>
            </div>

            {/* 오류 메시지 */}
            {error && (
                <div className={`bg-red-100 text-red-800 ${isMobile ? 'p-3 m-4' : 'p-3 m-5'} rounded-md border border-red-200 flex justify-between items-center`}>
                    <span>⚠️ {error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="bg-transparent border-none text-red-800 cursor-pointer font-bold text-lg hover:bg-red-200 rounded px-2"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* 모바일 탭 네비게이션 */}
            {isMobile && (
                <div className="flex bg-white  rounded-lg border overflow-hidden">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`flex-1 p-3 border-none ${
                            activeTab === 'create' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white text-gray-600'
                        } font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5`}
                    >
                        <img src="/plusIcon.png" alt="추가" className="w-5 h-5" />
                        새 연결
                    </button>
                    <button
                        onClick={() => setActiveTab('list')}
                        className={`flex-1 p-3 border-none ${
                            activeTab === 'list' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white text-gray-600'
                        } font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5`}
                    >
                        <img src="/folder.png" alt="폴더" className="w-5 h-5" />
                        연결 목록 ({connections.length})
                    </button>
                </div>
            )}

            {/* 메인 컨텐츠 - 전체 폭 사용하도록 수정 */}
            <div className={`${
                isMobile 
                    ? 'block ' 
                    : 'grid grid-cols-2 gap-6 px-6'
            } w-full`}>
                {/* 새 연결 생성 */}
                <div className={`bg-white ${isMobile ? '' : 'p-6'} ${
                    isMobile ? '' : 'rounded-xl border-2 border-blue-600 shadow-lg shadow-blue-100'
                } ${
                    isMobile ? 'mb-5' : ''
                } ${isMobile && activeTab !== 'create' ? 'hidden' : 'block'}`}>
                    <h3 className={`m-0 mb-5 ${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-blue-600 flex items-center gap-2`}>
                        새 연결 생성
                    </h3>

                    {/* 스트림 선택 */}
                    <div className="mb-5">
                        <label className={`flex items-center mb-2 font-semibold text-gray-600 ${
                            isMobile ? 'text-sm' : 'text-base'
                        } gap-1.5`}>

                            카메라 선택:
                        </label>
                        <select
                            value={selectedStream || ''}
                            onChange={(e) => setSelectedStream(Number(e.target.value) || null)}
                            className={`w-full ${
                                isMobile ? 'p-2.5' : 'p-3'
                            } border-2 border-gray-300 rounded-md ${
                                isMobile ? 'text-sm' : 'text-base'
                            } box-border focus:border-blue-500 focus:outline-none`}
                        >
                            <option value="">스트림을 선택하세요</option>
                            {streams.map(stream => (
                                <option key={stream.id} value={stream.id}>
                                    {stream.stream_name} ({stream.description || 'No description'})
                                </option>
                            ))}
                        </select>
                        <div className="text-xs text-gray-500 mt-1">
                            총 {streams.length}개 스트림 사용 가능
                        </div>
                    </div>

                    {/* 장치 선택 */}
                    <div className="mb-6">
                        <label className={`flex items-center mb-2 font-semibold text-gray-600 ${
                            isMobile ? 'text-sm' : 'text-base'
                        } gap-1.5`}>

                            연결할 장치들:
                        </label>
                        <div className={`${
                            isMobile ? 'max-h-80' : 'max-h-100'
                        } overflow-y-auto border-2 border-gray-300 rounded-md bg-gray-50 scrollbar-hide`}
                        style={{
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none'
                        }}>
                            {devices.length === 0 ? (
                                <div className="p-5 text-center text-gray-500">
                                    등록된 장치가 없습니다.
                                </div>
                            ) : (
                                devices.map(device => {
                                    const isConnected = connections.some(conn =>
                                        conn.device_id === device.device_id && conn.stream_id === selectedStream
                                    );

                                    return (
                                        <label
                                            key={device.device_id}
                                            className={`flex items-center ${
                                                isMobile ? 'p-2.5 px-3' : 'p-3 px-4'
                                            } border-b border-gray-200 cursor-pointer transition-all duration-200 ${
                                                selectedDevices.includes(device.device_id)
                                                    ? 'bg-blue-50'
                                                    : isConnected
                                                        ? 'bg-green-50'
                                                        : 'bg-white hover:bg-gray-50'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedDevices.includes(device.device_id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedDevices([...selectedDevices, device.device_id]);
                                                    } else {
                                                        setSelectedDevices(selectedDevices.filter(id => id !== device.device_id));
                                                    }
                                                }}
                                                className="mr-3"
                                            />
                                            <div className="flex-1">
                                                <div className={`font-semibold text-gray-800 ${
                                                    isMobile ? 'text-sm' : 'text-base'
                                                }`}>
                                                    {device.device_name}
                                                </div>
                                                <div className={`${
                                                    isMobile ? 'text-xs' : 'text-xs'
                                                } text-gray-500 mt-0.5`}>
                                                    📍 {device.device_location || '위치 정보 없음'}
                                                </div>
                                                {isConnected && selectedStream && (
                                                    <div className="text-xs text-green-600 mt-0.5 font-medium">
                                                        ✓ 이미 연결됨
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {selectedDevices.length}개 장치 선택됨 / 총 {devices.length}개
                        </div>
                    </div>

                    {/* 연결 버튼 */}
                    <button
                        onClick={handleConnect}
                        disabled={loading || !selectedStream || selectedDevices.length === 0}
                        className={`w-full ${
                            isMobile ? 'p-3' : 'p-3.5'
                        } ${
                            loading || !selectedStream || selectedDevices.length === 0
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 cursor-pointer'
                        } text-white border-none rounded-md font-semibold ${
                            isMobile ? 'text-sm' : 'text-base'
                        } transition-all duration-200`}
                    >
                        {loading ? '🔄 연결 중...' : '🔗 연결 생성'}
                    </button>
                </div>

                {/* 기존 연결 목록 */}
                <div className={`bg-white ${isMobile ? 'p-5' : 'p-6'} rounded-xl border border-gray-200 ${
                    isMobile && activeTab !== 'list' ? 'hidden' : 'block'
                }`}>
                    <div className="flex justify-between items-center mb-5 flex-wrap gap-2.5">
                        <h3 className={`m-0 ${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-600 flex items-center gap-2`}>
                            
                            기존 연결 목록
                        </h3>
                        <div className={`bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full ${
                            isMobile ? 'text-xs' : 'text-sm'
                        } font-semibold`}>
                            총 {connections.length}개 연결
                        </div>
                    </div>

                    <div className={`${isMobile ? 'max-h-96' : 'max-h-[500px]'} overflow-y-auto`}>
                        {connections.length === 0 ? (
                            <div className={`text-center ${
                                isMobile ? 'py-10 px-5' : 'py-15 px-5'
                            } text-gray-500`}>
                                <div className={`flex items-center justify-center mb-4 ${
                                    isMobile ? 'h-9' : 'h-12'
                                }`}>
                                    
                                </div>
                                <div className={`${isMobile ? 'text-base' : 'text-lg'} font-medium`}>
                                    연결된 카메라가 없습니다.
                                </div>
                                <div className={`${isMobile ? 'text-xs' : 'text-sm'} mt-2`}>
                                    {isMobile ? '상단 탭에서' : '왼쪽에서'} 카메라와 장치를 연결해보세요.
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {connections.map((connection) => (
                                    <div
                                        key={`${connection.stream_id}-${connection.device_id}`}
                                        className={`${
                                            isMobile ? 'p-3' : 'p-4'
                                        } border-2 border-gray-200 rounded-lg ${
                                            isMobile ? 'flex-col' : 'flex-row'
                                        } flex justify-between items-${
                                            isMobile ? 'start' : 'center'
                                        } bg-gray-50 transition-all duration-200 hover:border-blue-500 hover:bg-blue-50 ${
                                            isMobile ? 'gap-2.5' : 'gap-0'
                                        }`}
                                    >
                                        <div className="flex-1">
                                            <div className={`font-semibold text-blue-600 ${
                                                isMobile ? 'text-sm' : 'text-base'
                                            } mb-1`}>
                                                📹 {connection.stream_name}
                                            </div>
                                            <div className={`${
                                                isMobile ? 'text-xs' : 'text-sm'
                                            } text-green-600 mb-1`}>
                                                ↓ 📱 {connection.device_name}
                                            </div>
                                            <div className={`${
                                                isMobile ? 'text-xs' : 'text-xs'
                                            } text-gray-500`}>
                                                연결일: {new Date(connection.connected_at).toLocaleString('ko-KR')}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDisconnect(connection.stream_id, connection.device_id)}
                                            className={`${
                                                isMobile ? 'px-2.5 py-1.5 text-xs self-end' : 'px-3 py-2 text-xs'
                                            } bg-red-600 text-white border-none rounded-md cursor-pointer font-semibold transition-all duration-200 hover:bg-red-700`}
                                        >
                                            🗑️ 연결 해제
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>


        </div>
    );
};

export default DeviceStreamManager;