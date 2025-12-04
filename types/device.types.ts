// types/device.types.ts - 오프라인 상태 지원을 위한 타입 확장
export interface Device {
  device_id: string;
  device_name: string;
  device_type?: string;
  created_at: string;
  last_seen_at?: string;
  last_seen_ip?: string;
  is_favorite?: boolean;
  admin_name?: string;
  device_location?: string;
  status?: 'online' | 'offline' | 'pending'; // 🔥 필수 상태 필드
  description?: string; // 🔥 디바이스 설명 추가
  // 🔥 연결 품질 정보 추가
  signal_strength?: number; // WiFi 신호 강도 (dBm)
  connection_quality?: 'excellent' | 'good' | 'fair' | 'poor';
  uptime_seconds?: number; // 가동 시간 (초)
  // 🔥 하드웨어 정보
  firmware_version?: string;
  hardware_version?: string;
  mac_address?: string;
}

export interface DeviceGroup {
  group_id: string;
  group_name: string;
  description?: string;
  color: string;
  device_ids: string[];
  created_at: string;
  updated_at?: string;
  is_favorite?: boolean;
  // 🔥 그룹 상태 정보 추가
  total_devices?: number;
  online_devices?: number;
  offline_devices?: number;
  last_activity_at?: string; // 그룹 내 마지막 활동 시간
}

export interface DeviceStats {
  total: number;
  online: number;
  favorites: number;
  // 🔥 상세 상태 통계 추가
  offline?: number;
  pending?: number;
  groups?: number;
  recent_activity?: number; // 최근 24시간 활동한 디바이스 수
}

// 🔥 디바이스 상태 관련 새로운 타입들
export interface DeviceConnectionStatus {
  isConnected: boolean;
  lastConnectedTime: string | null;
  hasData: boolean;
  statusText: 'online' | 'offline' | 'pending' | 'unknown' | 'data_only' | 'no_data';
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  signalStrength?: number;
}

export interface DeviceHealthInfo {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number; // 초 단위
  lastSeen: string;
  signalStrength?: number;
  batteryLevel?: number; // 배터리 기반 디바이스용
  memoryUsage?: number; // 메모리 사용률 (%)
  cpuUsage?: number; // CPU 사용률 (%)
  temperature?: number; // 디바이스 온도 (°C)
}

// 🔥 오프라인 데이터 관리 타입들
export interface CachedSensorData {
  device_id: string;
  cached_at: string;
  data_age: number; // 데이터 나이 (분 단위)
  is_stale: boolean; // 오래된 데이터인지 여부
  sensor_data: any; // 실제 센서 데이터
  chart_data?: any[]; // 차트 데이터
}

export interface OfflineCapability {
  supports_offline: boolean;
  cache_duration_hours: number; // 캐시 보관 기간
  auto_sync_on_reconnect: boolean; // 재연결시 자동 동기화
  offline_data_limit: number; // 오프라인 데이터 최대 개수
}

// 🔥 즐겨찾기 시스템 확장
export interface FavoriteItem {
  id: string;
  name: string;
  type: 'device' | 'group';
  description: string;
  totalCount: number;
  onlineCount: number;
  color?: string;
  devices?: Device[]; // 그룹인 경우 포함된 디바이스들
  statusColor?: string; // 디바이스인 경우 상태 색상
  last_accessed?: string; // 마지막 접근 시간
  access_count?: number; // 접근 횟수 (인기도 측정용)
}

// 🔥 홈 화면 상태 관리 타입들
export interface HomePageState {
  selectedFavoriteType: 'device' | 'group' | null;
  selectedFavoriteId: string | null;
  isLoadingLastSelection: boolean;
  lastSelectionTime?: string;
  autoSelectEnabled: boolean;
}

// 🔥 디바이스 대시보드 Props 확장
export interface SensorDashboardContentProps {
  selectedDevice: Device | null;
  latestData: any;
  sensorLoading: boolean;
  chartData: any;
  historyData: any;
  isMobile: boolean;
  devices: Device[];
  weatherData: any;
  weatherLoading: boolean;
  weatherError: any;
  weatherForecast: any;
  selectedRegion: string;
  onRefresh: () => void;
  onWeatherRefresh: (region?: string) => void;
  onRegionChange: (region: string) => void;
  deviceId?: string;
  selectedFavoriteType?: string;
  selectedFavoriteId?: string | number;
  selectedGroup?: any;
  groups?: any[];
  // 🔥 실제 디바이스 상태 정보
  isDeviceConnected?: boolean;
  lastConnectedTime?: string | null;
  cachedData?: any;
  deviceHealthInfo?: DeviceHealthInfo;
  connectionStatus?: DeviceConnectionStatus;
}

export interface GroupSensorDashboardContentProps {
  selectedGroup: any;
  groupDevices: Device[];
  isMobile: boolean;
  weatherData: any;
  weatherLoading: boolean;
  weatherError: any;
  weatherForecast: any;
  selectedRegion: string;
  onWeatherRefresh: (region?: string) => void;
  onRegionChange: (region: string) => void;
  devices: Device[];
  // 🔥 디바이스 상태 판단 함수들
  getDeviceStatus: (device: Device) => 'online' | 'offline' | 'pending';
  isDeviceOnline: (device: Device) => boolean;
  getLastConnectedTime: (device: Device) => string | null;
  getDeviceHealth?: (device: Device) => DeviceHealthInfo;
}

// 🔥 센서 탭 컨텐츠 Props 확장
export interface FlexibleSensorTabContentProps {
  latestData: any;
  chartData: any[];
  isMobile: boolean;
  historyData?: any[];
  hideSensorInfo?: boolean;
  hideDataManagement?: boolean;
  hideAlerts?: boolean;
  deviceId?: string;
  // 🔥 개선된 오프라인 대응 props
  isDeviceConnected?: boolean;
  cachedData?: any;
  cachedChartData?: any[];
  lastDataUpdateTime?: string | null;
  deviceHealthInfo?: DeviceHealthInfo;
  connectionQuality?: 'excellent' | 'good' | 'fair' | 'poor';
}

// 🔥 즐겨찾기 목록 Props 확장
export interface FavoriteListProps {
  favoriteItems: FavoriteItem[];
  selectedFavoriteType: 'device' | 'group' | null;
  selectedFavoriteId: string | null;
  favoriteDevices: Device[];
  favoriteGroupsCount: number;
  isMobile: boolean;
  isLoadingLastSelection?: boolean;
  onFavoriteItemSelect: (item: FavoriteItem) => void;
  onRefresh: () => void;
  getDeviceStatusText: (device: Device) => string;
  // 🔥 디바이스 상태 판단 함수들 (optional)
  getDeviceStatus?: (device: Device) => 'online' | 'offline' | 'pending';
  isDeviceOnline?: (device: Device) => boolean;
  getDeviceHealth?: (device: Device) => DeviceHealthInfo;
}

// 🔥 기존 타입들 유지
export interface CreateGroupRequest {
  groupName: string;
  description: string;
  selectedDeviceIds: string[];
}

export interface GroupCreateResponse {
  success: boolean;
  message: string;
  group?: {
    groupId: string;
    groupName: string;
    description: string;
    color: string;
    deviceCount: number;
  };
  error?: string;
}

export interface SensorData {
  id?: number;
  device_id?: string;
  sensor_type?: string;
  value?: number;
  unit?: string;
  recorded_at?: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  lightLevel?: number;
  motionLevel?: number;
  gasLevel?: number;
  deviceStatus?: number;
  timestamp?: string;
  // 🔥 데이터 품질 정보 추가
  data_quality?: 'excellent' | 'good' | 'fair' | 'poor';
  is_interpolated?: boolean; // 보간된 데이터인지
  confidence_level?: number; // 신뢰도 (0-100)
}

export interface DeviceSensorData {
  device: Device;
  sensorData: SensorData | null;
  isOnline: boolean;
  lastError?: string;
  // 🔥 캐시 정보 추가
  cachedData?: SensorData;
  cacheAge?: number; // 캐시 나이 (분)
  dataSource: 'realtime' | 'cache' | 'interpolated';
}

export interface GroupSensorResponse {
  success: boolean;
  group: DeviceGroup & {
    device_ids: string[];
  };
  devices: Device[];
  sensors: Record<string, SensorData[]>;
  error?: string;
  // 🔥 그룹 상태 정보 추가
  group_status?: {
    total_devices: number;
    online_devices: number;
    offline_devices: number;
    last_update: string;
  };
}

// 🔥 API 응답 타입들 확장
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  // 🔥 메타데이터 추가
  timestamp?: string;
  request_id?: string;
  cached?: boolean; // 캐시된 응답인지
  cache_age?: number; // 캐시 나이 (초)
}

export interface DevicesWithFavoritesResponse extends ApiResponse {
  devices: Device[];
  stats: DeviceStats;
  // 🔥 디바이스 상태 요약 추가
  status_summary?: {
    online: Device[];
    offline: Device[];
    pending: Device[];
    recently_offline: Device[]; // 최근 오프라인된 디바이스들
  };
}

export interface ToggleFavoriteResponse extends ApiResponse {
  isFavorite: boolean;
}

export interface ToggleGroupFavoriteResponse extends ApiResponse {
  isFavorite: boolean;
  groupId: string;
}

// 🔥 디바이스 상세 정보 응답 타입 (새로 추가)
export interface DeviceDetailResponse extends ApiResponse {
  device: Device & {
    // 추가 상세 정보들
    total_data_points?: number;
    first_seen_at?: string;
    device_model?: string;
    serial_number?: string;
    last_firmware_update?: string;
    total_uptime_hours?: number;
    average_signal_strength?: number;
    data_transmission_rate?: number; // 데이터 전송률 (per minute)
    error_count_24h?: number; // 24시간 내 오류 횟수
  };
  sensorData?: SensorData[];
  connectionHistory?: Array<{
    connected_at: string;
    disconnected_at?: string;
    ip_address: string;
    connection_duration_minutes?: number;
    disconnection_reason?: string;
  }>;
  recentEvents?: DeviceEvent[]; // 최근 이벤트들
  performanceMetrics?: DevicePerformanceMetrics;
}

// 🔥 디바이스 삭제 응답 타입 (새로 추가)
export interface DeleteDeviceResponse extends ApiResponse {
  deviceId: string;
  deletedAt: string;
  affectedGroups?: Array<{
    group_id: string;
    group_name: string;
    remaining_device_count: number;
  }>; // 삭제로 인해 영향받은 그룹들의 상세 정보
  deletedDataPoints?: number; // 삭제된 센서 데이터 포인트 수
  backupCreated?: boolean; // 백업이 생성되었는지 여부
  backupLocation?: string; // 백업 위치 (생성된 경우)
}

// 🔥 Hook 타입들 확장
export interface UseDeviceGroupsReturn {
  groups: DeviceGroup[];
  loading: boolean;
  error: string | null;
  createGroup: (groupName: string, description: string, deviceIds: string[]) => Promise<boolean>;
  updateGroup: (groupId: string, updates: Partial<DeviceGroup>) => Promise<boolean>;
  deleteGroup: (groupId: string) => Promise<boolean>;
  refreshGroups: () => Promise<void>;
  getUngroupedDevices: (allDevices: Device[]) => Device[];
  toggleGroupFavorite: (groupId: string) => Promise<boolean>;
  // 🔥 그룹 상태 관련 함수들 추가
  getGroupStatus: (groupId: string) => Promise<GroupSensorResponse>;
  getGroupDevices: (group: DeviceGroup, allDevices: Device[]) => Device[];
  getGroupHealth: (group: DeviceGroup, allDevices: Device[]) => {
    healthy: number;
    warning: number;
    critical: number;
  };
}

// 🔥 디바이스 상태 유틸리티 타입들
export type DeviceStatus = 'online' | 'offline' | 'pending' | 'unknown';

export interface DeviceStatusInfo {
  status: DeviceStatus;
  color: string;
  text: string;
  icon?: string;
  description?: string;
}

// 🔥 연결 품질 타입들
export interface ConnectionQualityInfo {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  signalStrength?: number; // dBm
  latency?: number; // ms
  packetLoss?: number; // %
  description: string;
  color: string;
}

// 🔥 디바이스 성능 모니터링
export interface DevicePerformanceMetrics {
  device_id: string;
  collected_at: string;
  cpu_usage: number; // %
  memory_usage: number; // %
  disk_usage: number; // %
  network_usage: {
    bytes_sent: number;
    bytes_received: number;
  };
  temperature: number; // °C
  uptime: number; // seconds
  sensor_read_rate: number; // readings per minute
}

// 🔥 알림 및 이벤트 타입들
export interface DeviceEvent {
  type: 'device_connected' | 'device_disconnected' | 'data_received' | 'alert_triggered' | 'settings_changed' | 'health_warning' | 'connection_quality_changed';
  device_id: string;
  timestamp: string;
  data?: any;
  user_id?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  acknowledged?: boolean;
}

export interface SystemEvent {
  type: 'user_login' | 'user_logout' | 'group_created' | 'group_deleted' | 'system_maintenance' | 'cache_cleared' | 'sync_completed';
  timestamp: string;
  user_id?: string;
  details?: any;
  affected_devices?: string[]; // 영향받은 디바이스 ID들
}

// 🔥 캐시 및 동기화 관련
export interface CacheSettings {
  device_id?: string; // 특정 디바이스용 설정, null이면 전역 설정
  max_age_minutes: number; // 캐시 최대 보관 시간
  auto_refresh: boolean; // 자동 새로고침 여부
  sync_on_reconnect: boolean; // 재연결시 동기화 여부
  compression_enabled: boolean; // 데이터 압축 여부
  max_entries: number; // 최대 캐시 항목 수
}

export interface SyncStatus {
  device_id: string;
  last_sync: string;
  sync_in_progress: boolean;
  pending_changes: number; // 동기화 대기 중인 변경사항 수
  sync_errors: string[]; // 동기화 오류 목록
  next_sync_scheduled?: string; // 다음 동기화 예정 시간
}

// 🔥 최종 통합 인터페이스
export interface DeviceManagementSystem {
  devices: Device[];
  groups: DeviceGroup[];
  sensorData: Record<string, SensorData[]>;
  cachedSensorData: Record<string, CachedSensorData>; // 🔥 캐시 데이터 추가
  alerts: any[];
  settings: any[];
  analytics: any[];
  events: DeviceEvent[];
  systemEvents: SystemEvent[];
  cacheSettings: CacheSettings[];
  syncStatus: Record<string, SyncStatus>; // device_id를 키로 하는 동기화 상태
  // 🔥 실시간 상태 정보
  deviceConnections: Record<string, DeviceConnectionStatus>;
  deviceHealth: Record<string, DeviceHealthInfo>;
  connectionQuality: Record<string, ConnectionQualityInfo>;
  performanceMetrics: Record<string, DevicePerformanceMetrics>;
}