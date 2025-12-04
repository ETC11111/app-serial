// types/group.types.ts
import { FlexibleSensorData } from './sensor.types';

export interface DeviceGroup {
  group_id: string | number;
  group_name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  device_count?: number;
}

export interface GroupDevice {
  device_id: string;
  device_name: string;
  group_id: string | number;
  device_type?: string;
  status?: 'online' | 'offline' | 'unknown';
  last_seen?: string;
}

export interface GroupSensorData {
  device_id: string;
  device_name: string;
  group_id: string | number;
  flexibleData: FlexibleSensorData | null;
  status?: 'online' | 'offline' | 'unknown';
  last_update?: string;
}

export interface GroupStreamData {
  group_id: string | number;
  streams: StreamDevice[];
  total_streams: number;
}

export interface StreamDevice {
  stream_id: string;
  device_id: string;
  device_name: string;
  stream_url: string;
  stream_type: string;
  is_active: boolean;
  position?: {
    x: number;
    y: number;
  };
}