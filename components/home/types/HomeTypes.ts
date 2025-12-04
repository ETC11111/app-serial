// components/home/types/HomeTypes.ts
import { Device, DeviceGroup } from '../../../types/device.types';

export interface FavoriteItem {
  type: 'device' | 'group';
  id: string;
  name: string;
  description?: string;
  devices: Device[];
  color?: string;
  onlineCount: number;
  totalCount: number;
}

export interface Notification {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  deviceName?: string;
  sensorName?: string;
  sensorChannel?: number;
  severity?: 'critical' | 'warning' | 'info';
  isRead: boolean;
}

export interface AlertLogItem {
  id: string;
  sensor_name?: string;
  sensor_type: string;
  condition_type: 'above' | 'below';
  message: string;
  created_at: string;
  value_index?: number;
}

export interface AlertSettingItem {
  id: string;
  sensor_name: string;
  value_index: number;
  condition_type: 'above' | 'below';
  threshold_value: number;
  is_active: boolean;
}

export interface HeaderNotificationBannerProps {
  notifications: Notification[];
  compact?: boolean;
}

export interface HomeHeaderProps {
  user: any;
  notifications: Notification[];
  onNotificationClick: () => void;
  onSettingsClick: () => void;
  onNotificationRead: (id: string) => void;
  onAllNotificationsRead: () => void;
  unreadCount: number;
}