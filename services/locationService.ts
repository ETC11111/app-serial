// services/locationService.ts - 간단한 IP 기반 지역 매핑 서비스

interface IPLocationData {
  ip: string;
  region: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

interface WeatherRegionMapping {
  [key: string]: string; // IP 패턴 -> 기상청 지역명
}

class LocationService {
  private readonly API_BASE = '/api/weather';
  
  // 🔥 간단한 IP 기반 지역 매핑
  private readonly IP_REGION_MAPPING: WeatherRegionMapping = {
    // 사설 IP (로컬)
    '10.': '익산',     // 사설 IP
    '172.': '익산',    // 사설 IP
    '192.168.': '익산', // 사설 IP
    '127.': '익산',    // 로컬호스트
    
    // 기본값
    'default': '익산'
  };

  /**
   * IP 주소에서 지역을 추출
   */
  getRegionFromIP(ip: string): string {
    if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
      return '익산'; // 로컬호스트는 기본값
    }

    // IP 패턴 매칭
    for (const [pattern, region] of Object.entries(this.IP_REGION_MAPPING)) {
      if (ip.startsWith(pattern)) {
        console.log(`📍 IP ${ip} -> 지역 ${region} (패턴: ${pattern})`);
        return region;
      }
    }

    console.warn(`⚠️ IP ${ip}에 대한 지역 매핑을 찾을 수 없음, 기본값 사용`);
    return '익산';
  }

  /**
   * 장치 ID로 날씨 정보 조회 (백엔드 API 활용)
   */
  async getWeatherByDevice(deviceId: string): Promise<any> {
    try {
      console.log(`🌤️ 장치 ${deviceId}의 날씨 정보 조회 중...`);
      
      const response = await fetch(`${this.API_BASE}/device/${deviceId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.weather) {
        console.log(`✅ 장치 ${deviceId} 날씨 조회 성공:`, data.weather.region);
        return data.weather;
      } else {
        throw new Error(data.error || '날씨 정보를 가져올 수 없습니다');
      }
    } catch (error) {
      console.error(`❌ 장치 ${deviceId} 날씨 조회 실패:`, error);
      throw error;
    }
  }

  /**
   * 현재 사용자의 IP 기반 지역 조회
   */
  async getCurrentUserRegion(): Promise<string> {
    try {
      // 외부 IP 조회 서비스 사용
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      const userIP = data.ip;
      
      console.log(`🌍 사용자 IP: ${userIP}`);
      return this.getRegionFromIP(userIP);
    } catch (error) {
      console.warn('⚠️ IP 조회 실패, 기본값 사용:', error);
      return '익산';
    }
  }

  /**
   * 장치 목록에서 자동으로 지역을 감지하여 날씨 조회
   */
  async getAutoDetectedWeather(devices: any[]): Promise<any> {
    if (!devices || devices.length === 0) {
      throw new Error('장치 정보가 없습니다');
    }

    // 첫 번째 온라인 장치 사용
    const onlineDevice = devices.find(device => device.status === 'online');
    const targetDevice = onlineDevice || devices[0];

    console.log(`🎯 자동 감지된 장치: ${targetDevice.device_id} (${targetDevice.device_name})`);

    try {
      return await this.getWeatherByDevice(targetDevice.device_id);
    } catch (error) {
      console.warn('⚠️ 장치 기반 날씨 조회 실패, 사용자 IP 기반으로 대체:', error);
      
      // 장치 기반 조회 실패 시 사용자 IP 기반으로 대체
      const userRegion = await this.getCurrentUserRegion();
      return {
        region: userRegion,
        deviceId: targetDevice.device_id,
        deviceName: targetDevice.device_name,
        isAutoDetected: true,
        fallbackReason: '장치 기반 조회 실패'
      };
    }
  }
}

export const locationService = new LocationService();
export type { IPLocationData, WeatherRegionMapping };