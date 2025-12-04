// services/weatherService.ts - 이미지 함수 추가된 버전

interface ProcessedWeatherData {
  currentTemp: number | null;
  currentHumidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  skyCondition: string;
  precipitationType: string;
  updateTime: string;
  pressure: number | null;
  feelsLike: number | null;
  visibility: number | null;
  icon: string;
  region?: string;
  stationCode?: string;
  windDirectionName?: string;
  emoji?: string;
  isFallback?: boolean; // 🔥 폴백 데이터 표시
}

interface WeatherApiResponse {
  success: boolean;
  weather?: ProcessedWeatherData;
  error?: string;
  cached?: boolean;
  usedFallback?: boolean;
}

interface ForecastApiResponse {
  success: boolean;
  region?: string;
  baseWeather?: ProcessedWeatherData;
  forecasts?: ProcessedWeatherData[];
  error?: string;
  cached?: boolean;
  usedFallback?: boolean;
}

interface RegionsApiResponse {
  success: boolean;
  regions?: string[];
  totalCount?: number;
  error?: string;
}

class WeatherService {
  private readonly BASE_URL = '/api/weather';
  private readonly REQUEST_TIMEOUT = 30000; // 30초
  private readonly MAX_RETRIES = 2;
  
  // 🌍 한국 전국 지역 관측소 코드 매핑 (백엔드와 동기화)
  private readonly STATION_CODES: { [key: string]: string } = {
    // 수도권
    '서울': '108', '인천': '112', '수원': '119', '문산': '115',
    '고양': '108', '성남': '108', '의정부': '108', '부천': '112',
    '광명': '112', '평택': '232', '과천': '108', '오산': '119',
    '시흥': '112', '군포': '119', '의왕': '119', '하남': '108',
    '용인': '119', '파주': '115', '이천': '119', '안성': '119',
    '김포': '112', '화성': '119', '광주': '108', '여주': '119',
    '양평': '108', '동두천': '108', '가평': '108', '연천': '115',
    '양주': '108', '포천': '108', '구리': '108', '남양주': '108',
    
    // 강원도
    '춘천': '101', '강릉': '105', '속초': '90', '원주': '114',
    '영월': '121', '대관령': '100', '홍천': '101', '횡성': '101',
    '평창': '121', '정선': '121', '철원': '101', '화천': '101',
    '양구': '101', '인제': '101', '고성': '90', '양양': '90',
    '동해': '105', '삼척': '105', '태백': '121',
    
    // 충청북도
    '청주': '131', '충주': '127', '제천': '127', '보은': '131',
    '옥천': '131', '영동': '131', '증평': '131', '진천': '131',
    '괴산': '131', '음성': '131', '단양': '127',
    
    // 충청남도
    '대전': '133', '서산': '129', '천안': '232', '보령': '235',
    '아산': '232', '당진': '129', '공주': '133', '논산': '133',
    '계룡': '133', '금산': '133', '부여': '133', '서천': '235',
    '청양': '133', '홍성': '129', '예산': '129', '태안': '129',
    
    // 전라북도
    '전주': '146', '익산': '244', '군산': '140', '정읍': '245',
    '남원': '247', '김제': '146', '완주': '146', '진안': '146',
    '무주': '146', '장수': '146', '임실': '146', '순창': '146',
    '고창': '140', '부안': '140',
    
    // 전라남도
    '광주': '156', '목포': '165', '여수': '168', '완도': '170',
    '해남': '261', '순천': '168', '나주': '156', '광양': '168',
    '담양': '156', '곡성': '156', '구례': '156', '고흥': '168',
    '보성': '168', '화순': '156', '장흥': '168', '강진': '168',
    '영암': '165', '무안': '165', '함평': '165', '영광': '165',
    '장성': '156', '신안': '165',
    
    // 경상북도
    '대구': '143', '포항': '138', '안동': '136', '상주': '137',
    '문경': '273', '영주': '272', '울릉도': '115', '경주': '138',
    '김천': '143', '구미': '143', '영천': '143', '경산': '143',
    '군위': '143', '의성': '137', '청송': '136', '영양': '136',
    '영덕': '138', '청도': '143', '고령': '143', '성주': '143',
    '칠곡': '143', '예천': '137', '봉화': '136', '울진': '138',
    '울릉': '115',
    
    // 경상남도
    '부산': '159', '울산': '152', '창원': '155', '진주': '192',
    '통영': '162', '거제': '294', '김해': '159', '양산': '152',
    '의령': '192', '함안': '192', '창녕': '192', '고성': '192',
    '남해': '162', '하동': '192', '산청': '192', '함양': '192',
    '거창': '192', '합천': '192', '밀양': '155', '사천': '192',
    '진해': '155', '마산': '155',
    
    // 제주도
    '제주': '184', '서귀포': '189', '성산': '188', '고산': '185',
    '제주시': '184', '서귀포시': '189', '성산포': '188',
    
    // 🔥 추가 소도시 및 읍면 지역 (백엔드와 동기화)
    // 경기도 추가
    '가평군': '108', '연천군': '115', '양평군': '108', '포천시': '108',
    '동두천시': '108', '양주시': '108', '구리시': '108', '남양주시': '108',
    '하남시': '108', '의정부시': '108', '고양시': '108', '성남시': '108',
    '부천시': '112', '광명시': '112', '과천시': '108', '시흥시': '112',
    '군포시': '119', '의왕시': '119', '용인시': '119', '파주시': '115',
    '이천시': '119', '안성시': '119', '김포시': '112', '화성시': '119',
    '여주시': '119', '오산시': '119', '평택시': '232',
    
    // 강원도 추가
    '홍천군': '101', '횡성군': '101', '평창군': '121', '정선군': '121',
    '철원군': '101', '화천군': '101', '양구군': '101', '인제군': '101',
    '고성군': '90', '양양군': '90', '동해시': '105', '삼척시': '105',
    '태백시': '121', '영월군': '121', '원주시': '114', '춘천시': '101',
    '강릉시': '105', '속초시': '90',
    
    // 충청북도 추가
    '청주시': '131', '충주시': '127', '제천시': '127', '보은군': '131',
    '옥천군': '131', '영동군': '131', '증평군': '131', '진천군': '131',
    '괴산군': '131', '음성군': '131', '단양군': '127',
    
    // 충청남도 추가
    '대전시': '133', '서산시': '129', '천안시': '232', '보령시': '235',
    '아산시': '232', '당진시': '129', '공주시': '133', '논산시': '133',
    '계룡시': '133', '금산군': '133', '부여군': '133', '서천군': '235',
    '청양군': '133', '홍성군': '129', '예산군': '129', '태안군': '129',
    
    // 전라북도 추가
    '전주시': '146', '익산시': '244', '군산시': '140', '정읍시': '245',
    '남원시': '247', '김제시': '146', '완주군': '146', '진안군': '146',
    '무주군': '146', '장수군': '146', '임실군': '146', '순창군': '146',
    '고창군': '140', '부안군': '140',
    
    // 전라남도 추가
    '광주시': '156', '목포시': '165', '여수시': '168', '완도군': '170',
    '해남군': '261', '순천시': '168', '나주시': '156', '광양시': '168',
    '담양군': '156', '곡성군': '156', '구례군': '156', '고흥군': '168',
    '보성군': '168', '화순군': '156', '장흥군': '168', '강진군': '168',
    '영암군': '165', '무안군': '165', '함평군': '165', '영광군': '165',
    '장성군': '156', '신안군': '165',
    
    // 경상북도 추가
    '대구시': '143', '포항시': '138', '안동시': '136', '상주시': '137',
    '문경시': '273', '영주시': '272', '울릉군': '115', '경주시': '138',
    '김천시': '143', '구미시': '143', '영천시': '143', '경산시': '143',
    '군위군': '143', '의성군': '137', '청송군': '136', '영양군': '136',
    '영덕군': '138', '청도군': '143', '고령군': '143', '성주군': '143',
    '칠곡군': '143', '예천군': '137', '봉화군': '136', '울진군': '138',
    
    // 경상남도 추가
    '부산시': '159', '울산시': '152', '창원시': '155', '진주시': '192',
    '통영시': '162', '거제시': '294', '김해시': '159', '양산시': '152',
    '의령군': '192', '함안군': '192', '창녕군': '192', '고성군': '192',
    '남해군': '162', '하동군': '192', '산청군': '192', '함양군': '192',
    '거창군': '192', '합천군': '192', '밀양시': '155', '사천시': '192',
    '진해시': '155', '마산시': '155',
    
    // 제주도 추가
    '제주시': '184', '서귀포시': '189', '성산포': '188', '고산': '185',
    
    // 기타 주요 지역
    '울릉도': '115', '독도': '115', '백령도': '112', '대청도': '112',
    '소청도': '112', '연평도': '112'
  };

  // 🔥 폴백 날씨 데이터 생성 (더미 데이터 방지)
  private generateFallbackWeatherData(region: string): ProcessedWeatherData {
    console.log(`🔧 ${region}에 대한 폴백 날씨 데이터 생성`);
    
    const now = new Date();
    const month = now.getMonth() + 1;
    const hour = now.getHours();
    
    // 계절별 기본 온도 (고정값 사용)
    let baseTemp;
    if (month >= 12 || month <= 2) baseTemp = 5; // 겨울
    else if (month >= 3 && month <= 5) baseTemp = 15; // 봄
    else if (month >= 6 && month <= 8) baseTemp = 28; // 여름
    else baseTemp = 18; // 가을
    
    // 시간에 따른 온도 조정 (고정 패턴)
    const timeVariation = Math.sin((hour - 6) * Math.PI / 12) * 3;
    const currentTemp = Math.round((baseTemp + timeVariation) * 10) / 10;
    
    // 고정값 사용 (랜덤 제거)
    const humidity = 60;
    const windSpeed = 2.0;
    const pressure = 1013;
    
    return {
      currentTemp,
      currentHumidity: humidity,
      precipitation: 0,
      windSpeed,
      windDirection: 180, // 남쪽
      pressure,
      visibility: 10000,
      skyCondition: '맑음', // 고정값
      precipitationType: '없음',
      updateTime: new Date().toLocaleString('ko-KR') + ' (예상)',
      feelsLike: this.calculateFeelsLike(currentTemp, windSpeed, humidity),
      icon: this.getIconFromCondition('맑음', '없음'),
      region: region,
      windDirectionName: this.getWindDirection(180),
      emoji: this.getWeatherEmoji('맑음', '없음'),
      isFallback: true // 🔥 폴백 데이터임을 표시
    };
  }

  // 🔥 체감온도 계산
  private calculateFeelsLike(temp: number, windSpeed: number, humidity: number): number {
    let feelsLike = temp;
    
    if (temp < 10 && windSpeed > 1.3) {
      feelsLike = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeed * 3.6, 0.16) + 0.3965 * temp * Math.pow(windSpeed * 3.6, 0.16);
    } else if (temp > 26 && humidity > 40) {
      const rh = humidity;
      const t = temp;
      feelsLike = -8.784695 + 1.61139411 * t + 2.338549 * rh - 0.14611605 * t * rh - 0.012308094 * t * t - 0.016424828 * rh * rh + 0.002211732 * t * t * rh + 0.00072546 * t * rh * rh - 0.000003582 * t * t * rh * rh;
    }
    
    return Math.round(feelsLike * 10) / 10;
  }

  // 🔥 재시도가 포함된 fetch 함수
  private async fetchWithRetry(url: string, retries = this.MAX_RETRIES): Promise<Response> {
    let lastError: Error;
    
    for (let i = 0; i <= retries; i++) {
      try {
        console.log(`🔄 API 호출 시도 ${i + 1}/${retries + 1}: ${url}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        clearTimeout(timeoutId);
        
        // 🔥 502, 503, 504 에러는 재시도
        if (response.status >= 502 && response.status <= 504 && i < retries) {
          const waitTime = (i + 1) * 2000; // 2초, 4초, 6초...
          console.warn(`⚠️ ${response.status} 에러, ${waitTime}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        return response;
        
      } catch (error: any) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          console.warn(`⏰ 요청 시간 초과 (시도 ${i + 1})`);
        } else {
          console.warn(`❌ 네트워크 오류 (시도 ${i + 1}): ${error.message}`);
        }
        
        // 마지막 시도가 아니면 재시도
        if (i < retries) {
          const waitTime = (i + 1) * 2000;
          console.log(`⏳ ${waitTime}ms 후 재시도...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * 현재 날씨 정보 가져오기
   */
  async getCurrentWeather(region?: string): Promise<ProcessedWeatherData | null> {
    const regionName = region || '익산';
    
    try {
      console.log(`🌤️ 현재 날씨 조회 시작... (${regionName})`);
      
      // 🔥 백엔드 API는 경로 파라미터 방식을 사용: /current/:region?
      const url = region 
        ? `${this.BASE_URL}/current/${encodeURIComponent(region)}` 
        : `${this.BASE_URL}/current`;
      
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        // 🔥 502, 503, 504 에러는 즉시 폴백 데이터 반환
        if (response.status >= 502 && response.status <= 504) {
          console.warn(`⚠️ 서버 오류 (${response.status}), 폴백 데이터 사용`);
          return this.generateFallbackWeatherData(regionName);
        }
        
        const errorText = await response.text();
        console.error('❌ 날씨 API 오류:', response.status, errorText);
        
        // 🔥 다른 HTTP 에러도 폴백 데이터로 처리
        if (response.status >= 400) {
          console.warn(`⚠️ HTTP ${response.status} 오류, 폴백 데이터 사용`);
          return this.generateFallbackWeatherData(regionName);
        }
        
        throw new Error(`Weather API error: ${response.status} - ${errorText}`);
      }

      const data: WeatherApiResponse = await response.json();
      
      if (!data.success) {
        console.warn('⚠️ API 응답 실패, 폴백 데이터 사용:', data.error);
        return this.generateFallbackWeatherData(regionName);
      }

      if (!data.weather) {
        console.warn('⚠️ 날씨 데이터 없음, 폴백 데이터 사용');
        return this.generateFallbackWeatherData(regionName);
      }

      console.log(`✅ 날씨 데이터 조회 성공: ${regionName}`, 
        data.usedFallback ? '(서버 폴백 데이터)' : '(실제 데이터)');
      
      // 🔥 서버에서 폴백 데이터를 사용했다면 표시
      if (data.usedFallback) {
        data.weather.isFallback = true;
      }
      
      return data.weather;

    } catch (error: any) {
      console.error(`❌ 날씨 API 호출 실패 (${regionName}):`, error);
      
      // 🔥 모든 에러 상황에서 폴백 데이터 반환
      console.log(`🔧 ${regionName} 폴백 데이터로 대체`);
      return this.generateFallbackWeatherData(regionName);
    }
  }

  /**
   * 예보 정보 가져오기
   */
  async getForecast(region?: string): Promise<ProcessedWeatherData[]> {
    const regionName = region || '익산';
    
    try {
      console.log(`🔮 예보 정보 조회 시작... (${regionName})`);
      
      const url = region ? `${this.BASE_URL}/forecast/${encodeURIComponent(region)}` : `${this.BASE_URL}/forecast`;
      
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        // 🔥 서버 오류 시 현재 날씨 기반 간단 예보 생성
        if (response.status >= 502 && response.status <= 504) {
          console.warn(`⚠️ 예보 서버 오류 (${response.status}), 간단 예보 생성`);
          return this.generateSimpleForecast(regionName);
        }
        
        const errorText = await response.text();
        console.error('❌ 예보 API 오류:', response.status, errorText);
        return this.generateSimpleForecast(regionName);
      }

      const data: ForecastApiResponse = await response.json();
      
      if (!data.success || !data.forecasts) {
        console.warn('⚠️ 예보 데이터 조회 실패, 간단 예보 생성:', data.error);
        return this.generateSimpleForecast(regionName);
      }

      console.log(`✅ 예보 데이터 조회 성공: ${regionName} (${data.forecasts.length}개)`);
      return data.forecasts;

    } catch (error: any) {
      console.error(`❌ 예보 API 호출 실패 (${regionName}):`, error);
      return this.generateSimpleForecast(regionName);
    }
  }

  // 🔥 간단한 예보 생성 (현재 날씨 기반)
  private async generateSimpleForecast(regionName: string): Promise<ProcessedWeatherData[]> {
    console.log(`🔧 ${regionName}에 대한 간단 예보 생성`);
    
    // 현재 날씨를 기반으로 예보 생성
    const currentWeather = await this.getCurrentWeather(regionName);
    
    if (!currentWeather) {
      return [];
    }

    const forecasts: ProcessedWeatherData[] = [];
    
    for (let i = 1; i <= 6; i++) {
      const futureTime = new Date();
      futureTime.setHours(futureTime.getHours() + i * 3);
      
      const tempVariation = Math.random() * 4 - 2;
      const estimatedTemp = currentWeather.currentTemp ? 
        Math.round((currentWeather.currentTemp + tempVariation) * 10) / 10 : null;

      const skyCondition = ['맑음', '구름많음', '흐림'][Math.floor(Math.random() * 3)];

      forecasts.push({
        currentTemp: estimatedTemp,
        currentHumidity: currentWeather.currentHumidity ? 
          Math.max(30, Math.min(90, currentWeather.currentHumidity + Math.random() * 20 - 10)) : null,
        precipitation: Math.random() > 0.8 ? Math.round(Math.random() * 2 * 10) / 10 : 0,
        windSpeed: currentWeather.windSpeed ? 
          Math.max(0, currentWeather.windSpeed + Math.random() * 2 - 1) : null,
        windDirection: currentWeather.windDirection ? 
          (currentWeather.windDirection + Math.random() * 60 - 30) % 360 : null,
        skyCondition: skyCondition,
        precipitationType: '없음',
        updateTime: futureTime.toLocaleString('ko-KR'),
        pressure: currentWeather.pressure ? 
          currentWeather.pressure + Math.random() * 6 - 3 : null,
        feelsLike: estimatedTemp,
        visibility: currentWeather.visibility,
        icon: this.getIconFromCondition(skyCondition, '없음'),
        emoji: this.getWeatherEmoji(skyCondition, '없음'),
        isFallback: true
      });
    }

    return forecasts;
  }

  /**
   * 사용 가능한 지역 목록 반환
   */
  async getAvailableRegions(): Promise<string[]> {
    try {
      const response = await this.fetchWithRetry(`${this.BASE_URL}/regions`);
      
      if (!response.ok) {
        console.warn('❌ 지역 목록 API 호출 실패, 로컬 데이터 사용');
        return Object.keys(this.STATION_CODES).sort();
      }

      const data: RegionsApiResponse = await response.json();
      
      if (data.success && data.regions) {
        return data.regions;
      } else {
        console.warn('❌ 지역 목록 조회 실패, 로컬 데이터 사용');
        return Object.keys(this.STATION_CODES).sort();
      }
      
    } catch (error) {
      console.error('지역 목록 조회 오류, 로컬 데이터 사용:', error);
      return Object.keys(this.STATION_CODES).sort();
    }
  }

  /**
   * 지역별 관측소 정보 반환
   */
  getStationInfo(region: string): { name: string; code: string } | null {
    const code = this.STATION_CODES[region];
    if (!code) {
      return null;
    }
    
    return {
      name: region,
      code: code
    };
  }

  /**
   * 풍향을 방위로 변환
   */
  getWindDirection(degree: number | null): string {
    if (degree === null) return '정온';
    
    const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const index = Math.round(degree / 45) % 8;
    return directions[index];
  }

  /**
   * 날씨 상태에 따른 이모지 반환
   */
  getWeatherEmoji(skyCondition: string, precipitationType: string): string {
    if (precipitationType !== '없음') {
      if (precipitationType.includes('눈')) return '❄️';
      if (precipitationType.includes('비')) return '🌧️';
    }
    
    switch (skyCondition) {
      case '맑음': return '☀️';
      case '구름많음': return '⛅';
      case '흐림': return '☁️';
      default: return '🌤️';
    }
  }

  /**
   * 날씨 상태에 따른 이미지 경로 반환
   */
  getWeatherImagePath(skyCondition: string, precipitationType: string): string {
    // 강수 타입 우선 체크
    if (precipitationType !== '없음') {
      if (precipitationType.includes('눈') || precipitationType.includes('설')) {
        return '/icons/weather-snow.png';
      }
      if (precipitationType.includes('비') || precipitationType.includes('소나기')) {
        return '/icons/weather-rain.png';
      }
      if (precipitationType.includes('빗방울')) {
        return '/icons/weather-drizzle.png';
      }
      if (precipitationType.includes('진눈깨비')) {
        return '/icons/weather-sleet.png';
      }
    }
    
    // 하늘 상태에 따른 이미지
    switch (skyCondition) {
      case '맑음':
        return '/icons/weather-sunny.png';
      case '구름많음':
        return '/icons/weather-partly-cloudy.png';
      case '흐림':
        return '/icons/weather-cloudy.png';
      default:
        return '/icons/weather-default.png';
    }
  }

  /**
   * 날씨 아이콘과 이미지 정보를 한번에 반환
   */
  getWeatherDisplay(skyCondition: string, precipitationType: string): {
    emoji: string;
    imagePath: string;
    description: string;
  } {
    return {
      emoji: this.getWeatherEmoji(skyCondition, precipitationType),
      imagePath: this.getWeatherImagePath(skyCondition, precipitationType),
      description: `${skyCondition} • ${precipitationType}`
    };
  }

  /**
   * 날씨 조건에 따른 아이콘 코드 생성
   */
  private getIconFromCondition(skyCondition: string, precipitationType: string): string {
    if (precipitationType !== '없음') {
      if (precipitationType.includes('눈')) return '13d';
      if (precipitationType.includes('비')) return '10d';
    }
    
    switch (skyCondition) {
      case '맑음': return '01d';
      case '구름많음': return '03d';
      case '흐림': return '04d';
      default: return '01d';
    }
  }

  /**
   * 체감온도 설명
   */
  getFeelsLikeDescription(temp: number | null, feelsLike: number | null): string {
    if (temp === null || feelsLike === null) return '';
    
    const diff = feelsLike - temp;
    if (Math.abs(diff) < 1) return '실제 온도와 비슷';
    else if (diff > 0) return `실제보다 ${diff.toFixed(1)}°C 더 따뜻함`;
    else return `실제보다 ${Math.abs(diff).toFixed(1)}°C 더 시원함`;
  }

  /**
   * 서비스 헬스 체크
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/health`, {
        signal: AbortSignal.timeout(5000) // 5초 타임아웃
      });
      return response.ok;
    } catch (error) {
      console.error('Weather service health check failed:', error);
      return false;
    }
  }
}

export const weatherService = new WeatherService();
export type { ProcessedWeatherData };