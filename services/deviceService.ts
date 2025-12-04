// services/deviceService.ts
import { BaseService } from './base';
import { 
  DeviceDetailResponse, 
  DeleteDeviceResponse, 
  ToggleGroupFavoriteResponse,
  DevicesWithFavoritesResponse,
  ToggleFavoriteResponse
} from '../types/device.types';

class DeviceService extends BaseService {
  async getDevices() {
    const response = await fetch(`${this.getBaseUrl()}/devices`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 즐겨찾기 정보와 함께 장치 목록 가져오기
  async getDevicesWithFavorites(): Promise<DevicesWithFavoritesResponse> {
    const response = await fetch(`${this.getBaseUrl()}/devices/with-favorites`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 즐겨찾기 토글 (추가/제거)
  async toggleDeviceFavorite(deviceId: string): Promise<ToggleFavoriteResponse> {
    const response = await fetch(`${this.getBaseUrl()}/devices/toggle-favorite`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ deviceId })
    });
    return this.handleResponse(response);
  }

  // 🔥 그룹 즐겨찾기 토글 (새로 추가)
  async toggleGroupFavorite(groupId: string): Promise<ToggleGroupFavoriteResponse> {
    const response = await fetch(`${this.getBaseUrl()}/devices/groups/${groupId}/toggle-favorite`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 장치 상세 정보 조회 (새로 추가)
  async getDeviceDetail(deviceId: string): Promise<DeviceDetailResponse> {
    const response = await fetch(`${this.getBaseUrl()}/devices/detail/${deviceId}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  async getDevice(deviceId: string) {
    const response = await fetch(`${this.getBaseUrl()}/devices/${deviceId}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  async registerDevice(deviceData: any) {
    const response = await fetch(`${this.getBaseUrl()}/devices/register`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(deviceData)
    });
    return this.handleResponse(response);
  }

  // 🔥 장치 정보 수정 - deviceLocation 파라미터 추가
  async updateDevice(deviceId: string, deviceData: { 
    deviceName: string; 
    adminName?: string;
    deviceLocation?: string; // 🔥 추가
  }) {
    const response = await fetch(`${this.getBaseUrl()}/devices/update/${deviceId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(deviceData)
    });
    return this.handleResponse(response);
  }

  // 🔥 장치 삭제 (올바른 엔드포인트로 수정)
  async deleteDevice(deviceId: string): Promise<DeleteDeviceResponse> {
    const response = await fetch(`${this.getBaseUrl()}/devices/delete/${deviceId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  async linkDevice(token: string) {
    const response = await fetch(`${this.getBaseUrl()}/devices/link-device`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ token })
    });
    return this.handleResponse(response);
  }

  // 🔥 그룹 관련 API
  async getGroupSensors(groupId: string) {
    const response = await fetch(`${this.getBaseUrl()}/devices/groups/${groupId}/sensors`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 새로 추가: 대기 중인 장치 목록
  async getPendingDevices() {
    const response = await fetch(`${this.getBaseUrl()}/devices/pending-devices`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }

  // 🔥 새로 추가: Device ID 중복 검사
  async checkDeviceId(deviceId: string) {
    const response = await fetch(`${this.getBaseUrl()}/devices/check-device-id`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ deviceId })
    });
    return this.handleResponse(response);
  }

  // 🔥 새로 추가: 대기 중인 장치 연결 - deviceLocation 파라미터 추가
  async linkPendingDevice(deviceId: string, adminName?: string, deviceLocation?: string) {
    const response = await fetch(`${this.getBaseUrl()}/devices/link-pending-device`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ 
        deviceId, 
        adminName,
        deviceLocation // 🔥 추가
      })
    });
    return this.handleResponse(response);
  }

  async invalidateCache(cacheTypes: string[] = ['devices', 'groups']) {
    try {
      const response = await fetch(`${this.getBaseUrl()}/devices/invalidate-cache`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ cacheTypes })
      });
      return this.handleResponse(response);
    } catch (error) {
      console.error('Cache invalidation error:', error);
      throw error;
    }
  }

  // 🔥 캐시 버스팅과 함께 장치 목록 가져오기
  async getDevicesWithFavoritesFresh(): Promise<DevicesWithFavoritesResponse> {
    const timestamp = Date.now();
    const response = await fetch(`${this.getBaseUrl()}/devices/with-favorites?bust=${timestamp}`, {
      headers: this.getAuthHeaders(),
      credentials: 'include'
    });
    return this.handleResponse(response);
  }
}

export const deviceService = new DeviceService();