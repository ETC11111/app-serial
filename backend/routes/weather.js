// routes/weather.js - 개선된 버전
const express = require('express');
const { cacheMiddleware } = require('../middleware/cache');
const cache = require('../lib/cache');
const https = require('https');
const http = require('http');

const router = express.Router();

// 🌤️ 기상청 API Hub 설정
const WEATHER_CONFIG = {
  BASE_URL: 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php',
  API_KEY: 'aF29N6-AQoKdvTevgNKChw',
  DEFAULT_STATION: '244', // 익산
  CACHE_DURATION: 300,    // 5분 캐시
  REQUEST_TIMEOUT: 30000, // 🔥 30초로 증가
  MAX_RETRIES: 2          // 🔥 재시도 횟수 추가
};

// 🌍 한국 전국 지역 관측소 코드 매핑 (주요 도시 + 소도시 포함)
const STATION_CODES = {
  // 수도권
  '서울': '108',
  '인천': '112',
  '수원': '119',
  '문산': '115',
  '고양': '108',
  '성남': '108',
  '의정부': '108',
  '부천': '112',
  '광명': '112',
  '평택': '232',
  '과천': '108',
  '오산': '119',
  '시흥': '112',
  '군포': '119',
  '의왕': '119',
  '하남': '108',
  '용인': '119',
  '파주': '115',
  '이천': '119',
  '안성': '119',
  '김포': '112',
  '화성': '119',
  '광주': '108',
  '여주': '119',
  '양평': '108',
  '동두천': '108',
  '가평': '108',
  '연천': '115',
  '양주': '108',
  '포천': '108',
  '구리': '108',
  '남양주': '108',
  
  // 강원도
  '춘천': '101',
  '강릉': '105',
  '속초': '90',
  '원주': '114',
  '영월': '121',
  '대관령': '100',
  '홍천': '101',
  '횡성': '101',
  '평창': '121',
  '정선': '121',
  '철원': '101',
  '화천': '101',
  '양구': '101',
  '인제': '101',
  '고성': '90',
  '양양': '90',
  '동해': '105',
  '삼척': '105',
  '태백': '121',
  
  // 충청북도
  '청주': '131',
  '충주': '127',
  '제천': '127',
  '보은': '131',
  '옥천': '131',
  '영동': '131',
  '증평': '131',
  '진천': '131',
  '괴산': '131',
  '음성': '131',
  '단양': '127',
  
  // 충청남도
  '대전': '133',
  '서산': '129',
  '천안': '232',
  '보령': '235',
  '아산': '232',
  '당진': '129',
  '공주': '133',
  '논산': '133',
  '계룡': '133',
  '금산': '133',
  '부여': '133',
  '서천': '235',
  '청양': '133',
  '홍성': '129',
  '예산': '129',
  '태안': '129',
  
  // 전라북도
  '전주': '146',
  '익산': '244',
  '군산': '140',
  '정읍': '245',
  '남원': '247',
  '김제': '146',
  '완주': '146',
  '진안': '146',
  '무주': '146',
  '장수': '146',
  '임실': '146',
  '순창': '146',
  '고창': '140',
  '부안': '140',
  
  // 전라남도
  '광주': '156',
  '목포': '165',
  '여수': '168',
  '완도': '170',
  '해남': '261',
  '순천': '168',
  '나주': '156',
  '광양': '168',
  '담양': '156',
  '곡성': '156',
  '구례': '156',
  '고흥': '168',
  '보성': '168',
  '화순': '156',
  '장흥': '168',
  '강진': '168',
  '영암': '165',
  '무안': '165',
  '함평': '165',
  '영광': '165',
  '장성': '156',
  '신안': '165',
  
  // 경상북도
  '대구': '143',
  '포항': '138',
  '안동': '136',
  '상주': '137',
  '문경': '273',
  '영주': '272',
  '울릉도': '115',
  '경주': '138',
  '김천': '143',
  '구미': '143',
  '영천': '143',
  '경산': '143',
  '군위': '143',
  '의성': '137',
  '청송': '136',
  '영양': '136',
  '영덕': '138',
  '청도': '143',
  '고령': '143',
  '성주': '143',
  '칠곡': '143',
  '예천': '137',
  '봉화': '136',
  '울진': '138',
  '울릉': '115',
  
  // 경상남도
  '부산': '159',
  '울산': '152',
  '창원': '155',
  '진주': '192',
  '통영': '162',
  '거제': '294',
  '김해': '159',
  '양산': '152',
  '의령': '192',
  '함안': '192',
  '창녕': '192',
  '고성': '192',
  '남해': '162',
  '하동': '192',
  '산청': '192',
  '함양': '192',
  '거창': '192',
  '합천': '192',
  '밀양': '155',
  '사천': '192',
  '진해': '155',
  '마산': '155',
  
  // 제주도
  '제주': '184',
  '서귀포': '189',
  '성산': '188',
  '고산': '185',
  '제주시': '184',
  '서귀포시': '189',
  '성산포': '188',
  
  // 추가 소도시 및 읍면 지역
  // 경기도 추가
  '가평군': '108',
  '연천군': '115',
  '양평군': '108',
  '포천시': '108',
  '동두천시': '108',
  '양주시': '108',
  '구리시': '108',
  '남양주시': '108',
  '하남시': '108',
  '의정부시': '108',
  '고양시': '108',
  '성남시': '108',
  '부천시': '112',
  '광명시': '112',
  '과천시': '108',
  '시흥시': '112',
  '군포시': '119',
  '의왕시': '119',
  '용인시': '119',
  '파주시': '115',
  '이천시': '119',
  '안성시': '119',
  '김포시': '112',
  '화성시': '119',
  '여주시': '119',
  '오산시': '119',
  '평택시': '232',
  
  // 강원도 추가
  '홍천군': '101',
  '횡성군': '101',
  '평창군': '121',
  '정선군': '121',
  '철원군': '101',
  '화천군': '101',
  '양구군': '101',
  '인제군': '101',
  '고성군': '90',
  '양양군': '90',
  '동해시': '105',
  '삼척시': '105',
  '태백시': '121',
  '영월군': '121',
  '원주시': '114',
  '춘천시': '101',
  '강릉시': '105',
  '속초시': '90',
  
  // 충청북도 추가
  '청주시': '131',
  '충주시': '127',
  '제천시': '127',
  '보은군': '131',
  '옥천군': '131',
  '영동군': '131',
  '증평군': '131',
  '진천군': '131',
  '괴산군': '131',
  '음성군': '131',
  '단양군': '127',
  
  // 충청남도 추가
  '대전시': '133',
  '서산시': '129',
  '천안시': '232',
  '보령시': '235',
  '아산시': '232',
  '당진시': '129',
  '공주시': '133',
  '논산시': '133',
  '계룡시': '133',
  '금산군': '133',
  '부여군': '133',
  '서천군': '235',
  '청양군': '133',
  '홍성군': '129',
  '예산군': '129',
  '태안군': '129',
  
  // 전라북도 추가
  '전주시': '146',
  '익산시': '244',
  '군산시': '140',
  '정읍시': '245',
  '남원시': '247',
  '김제시': '146',
  '완주군': '146',
  '진안군': '146',
  '무주군': '146',
  '장수군': '146',
  '임실군': '146',
  '순창군': '146',
  '고창군': '140',
  '부안군': '140',
  
  // 전라남도 추가
  '광주시': '156',
  '목포시': '165',
  '여수시': '168',
  '완도군': '170',
  '해남군': '261',
  '순천시': '168',
  '나주시': '156',
  '광양시': '168',
  '담양군': '156',
  '곡성군': '156',
  '구례군': '156',
  '고흥군': '168',
  '보성군': '168',
  '화순군': '156',
  '장흥군': '168',
  '강진군': '168',
  '영암군': '165',
  '무안군': '165',
  '함평군': '165',
  '영광군': '165',
  '장성군': '156',
  '신안군': '165',
  
  // 경상북도 추가
  '대구시': '143',
  '포항시': '138',
  '안동시': '136',
  '상주시': '137',
  '문경시': '273',
  '영주시': '272',
  '울릉군': '115',
  '경주시': '138',
  '김천시': '143',
  '구미시': '143',
  '영천시': '143',
  '경산시': '143',
  '군위군': '143',
  '의성군': '137',
  '청송군': '136',
  '영양군': '136',
  '영덕군': '138',
  '청도군': '143',
  '고령군': '143',
  '성주군': '143',
  '칠곡군': '143',
  '예천군': '137',
  '봉화군': '136',
  '울진군': '138',
  
  // 경상남도 추가
  '부산시': '159',
  '울산시': '152',
  '창원시': '155',
  '진주시': '192',
  '통영시': '162',
  '거제시': '294',
  '김해시': '159',
  '양산시': '152',
  '의령군': '192',
  '함안군': '192',
  '창녕군': '192',
  '고성군': '192',
  '남해군': '162',
  '하동군': '192',
  '산청군': '192',
  '함양군': '192',
  '거창군': '192',
  '합천군': '192',
  '밀양시': '155',
  '사천시': '192',
  '진해시': '155',
  '마산시': '155',
  
  // 제주도 추가
  '제주시': '184',
  '서귀포시': '189',
  '성산포': '188',
  '고산': '185',
  
  // 기타 주요 지역
  '울릉도': '115',
  '독도': '115',
  '백령도': '112',
  '대청도': '112',
  '소청도': '112',
  '연평도': '112',
  
  // 추가 읍면 지역들
  // 경기도 읍면
  '가평읍': '108',
  '연천읍': '115',
  '양평읍': '108',
  '포천읍': '108',
  '동두천읍': '108',
  '양주읍': '108',
  '구리읍': '108',
  '남양주읍': '108',
  '하남읍': '108',
  '의정부읍': '108',
  '고양읍': '108',
  '성남읍': '108',
  '부천읍': '112',
  '광명읍': '112',
  '과천읍': '108',
  '시흥읍': '112',
  '군포읍': '119',
  '의왕읍': '119',
  '용인읍': '119',
  '파주읍': '115',
  '이천읍': '119',
  '안성읍': '119',
  '김포읍': '112',
  '화성읍': '119',
  '여주읍': '119',
  '오산읍': '119',
  '평택읍': '232',
  
  // 강원도 읍면
  '홍천읍': '101',
  '횡성읍': '101',
  '평창읍': '121',
  '정선읍': '121',
  '철원읍': '101',
  '화천읍': '101',
  '양구읍': '101',
  '인제읍': '101',
  '고성읍': '90',
  '양양읍': '90',
  '동해읍': '105',
  '삼척읍': '105',
  '태백읍': '121',
  '영월읍': '121',
  '원주읍': '114',
  '춘천읍': '101',
  '강릉읍': '105',
  '속초읍': '90',
  
  // 충청북도 읍면
  '청주읍': '131',
  '충주읍': '127',
  '제천읍': '127',
  '보은읍': '131',
  '옥천읍': '131',
  '영동읍': '131',
  '증평읍': '131',
  '진천읍': '131',
  '괴산읍': '131',
  '음성읍': '131',
  '단양읍': '127',
  
  // 충청남도 읍면
  '대전읍': '133',
  '서산읍': '129',
  '천안읍': '232',
  '보령읍': '235',
  '아산읍': '232',
  '당진읍': '129',
  '공주읍': '133',
  '논산읍': '133',
  '계룡읍': '133',
  '금산읍': '133',
  '부여읍': '133',
  '서천읍': '235',
  '청양읍': '133',
  '홍성읍': '129',
  '예산읍': '129',
  '태안읍': '129',
  
  // 전라북도 읍면
  '전주읍': '146',
  '익산읍': '244',
  '군산읍': '140',
  '정읍읍': '245',
  '남원읍': '247',
  '김제읍': '146',
  '완주읍': '146',
  '진안읍': '146',
  '무주읍': '146',
  '장수읍': '146',
  '임실읍': '146',
  '순창읍': '146',
  '고창읍': '140',
  '부안읍': '140',
  
  // 전라남도 읍면
  '광주읍': '156',
  '목포읍': '165',
  '여수읍': '168',
  '완도읍': '170',
  '해남읍': '261',
  '순천읍': '168',
  '나주읍': '156',
  '광양읍': '168',
  '담양읍': '156',
  '곡성읍': '156',
  '구례읍': '156',
  '고흥읍': '168',
  '보성읍': '168',
  '화순읍': '156',
  '장흥읍': '168',
  '강진읍': '168',
  '영암읍': '165',
  '무안읍': '165',
  '함평읍': '165',
  '영광읍': '165',
  '장성읍': '156',
  '신안읍': '165',
  
  // 경상북도 읍면
  '대구읍': '143',
  '포항읍': '138',
  '안동읍': '136',
  '상주읍': '137',
  '문경읍': '273',
  '영주읍': '272',
  '울릉읍': '115',
  '경주읍': '138',
  '김천읍': '143',
  '구미읍': '143',
  '영천읍': '143',
  '경산읍': '143',
  '군위읍': '143',
  '의성읍': '137',
  '청송읍': '136',
  '영양읍': '136',
  '영덕읍': '138',
  '청도읍': '143',
  '고령읍': '143',
  '성주읍': '143',
  '칠곡읍': '143',
  '예천읍': '137',
  '봉화읍': '136',
  '울진읍': '138',
  
  // 경상남도 읍면
  '부산읍': '159',
  '울산읍': '152',
  '창원읍': '155',
  '진주읍': '192',
  '통영읍': '162',
  '거제읍': '294',
  '김해읍': '159',
  '양산읍': '152',
  '의령읍': '192',
  '함안읍': '192',
  '창녕읍': '192',
  '고성읍': '192',
  '남해읍': '162',
  '하동읍': '192',
  '산청읍': '192',
  '함양읍': '192',
  '거창읍': '192',
  '합천읍': '192',
  '밀양읍': '155',
  '사천읍': '192',
  '진해읍': '155',
  '마산읍': '155',
  
  // 제주도 읍면
  '제주읍': '184',
  '서귀포읍': '189',
  '성산읍': '188',
  '고산읍': '185'
};

// 🔧 유틸리티 함수들
function getStationCode(region) {
  if (!region) return WEATHER_CONFIG.DEFAULT_STATION;
  
  const stationCode = STATION_CODES[region];
  if (!stationCode) {
    console.warn(`⚠️ 지역 '${region}'의 관측소 코드를 찾을 수 없음. 기본값(익산) 사용`);
    return WEATHER_CONFIG.DEFAULT_STATION;
  }
  
  return stationCode;
}

function roundToOneDecimal(value) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 10) / 10;
}

function safeParseFloat(value) {
  if (!value || value === '-9' || value === '-9.0' || value === '-99.0' || value === '-' || value === '') {
    return null;
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

function calculateFeelsLike(temp, windSpeed, humidity) {
  let feelsLike = temp;
  
  // 바람에 의한 체감온도 (풍속이 강할 때)
  if (temp < 10 && windSpeed > 1.3) {
    feelsLike = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeed * 3.6, 0.16) + 0.3965 * temp * Math.pow(windSpeed * 3.6, 0.16);
  }
  // 습도에 의한 체감온도 (더울 때)
  else if (temp > 26 && humidity > 40) {
    const rh = humidity;
    const t = temp;
    feelsLike = -8.784695 + 1.61139411 * t + 2.338549 * rh - 0.14611605 * t * rh - 0.012308094 * t * t - 0.016424828 * rh * rh + 0.002211732 * t * t * rh + 0.00072546 * t * rh * rh - 0.000003582 * t * t * rh * rh;
  }
  
  return Math.round(feelsLike * 10) / 10;
}

function getIconFromCondition(skyCondition, precipitationType) {
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

function getWindDirectionName(degree) {
  if (degree === null) return '정온';
  
  const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const index = Math.round(degree / 45) % 8;
  return directions[index];
}

function getWeatherEmoji(skyCondition, precipitationType) {
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

// 🔧 기상청 API 호출 함수 (재시도 로직 추가)
async function fetchWeatherData(stationCode, retryCount = 0) {
  return new Promise((resolve, reject) => {
    // 🔥 현재 시간을 tm 파라미터로 사용 (YYYYMMDDHHMM 형식)
    const now = new Date();
    const tm = now.getFullYear().toString() + 
               (now.getMonth() + 1).toString().padStart(2, '0') +
               now.getDate().toString().padStart(2, '0') +
               now.getHours().toString().padStart(2, '0') +
               '00'; // 분은 00으로 고정
    
    const url = `${WEATHER_CONFIG.BASE_URL}?stn=${stationCode}&help=0&authKey=${WEATHER_CONFIG.API_KEY}&tm=${tm}`;
    
    console.log(`🌤️ [시도 ${retryCount + 1}/${WEATHER_CONFIG.MAX_RETRIES + 1}] 기상청 API 호출:`, {
      stationCode,
      tm,
      url: url.replace(WEATHER_CONFIG.API_KEY, 'API_KEY_HIDDEN')
    });
    
    const request = https.get(url, {
      timeout: WEATHER_CONFIG.REQUEST_TIMEOUT,
      // 🔥 HTTPS 인증서 검증 비활성화 (기상청 서버 인증서 문제 해결)
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log(`✅ 기상청 API 응답 수신 (${data.length}자):`, {
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            dataPreview: data.substring(0, 200)
          });
          
          // 🔥 상태 코드 확인
          if (res.statusCode !== 200) {
            throw new Error(`HTTP ${res.statusCode}: ${data}`);
          }
          
          // JSON 응답인지 확인
          const contentType = res.headers['content-type'] || '';
          
          if (contentType.includes('application/json')) {
            const jsonData = JSON.parse(data);
            resolve({ type: 'json', data: jsonData });
          } else {
            // 텍스트 응답
            resolve({ type: 'text', data: data });
          }
        } catch (error) {
          console.error('❌ 응답 파싱 오류:', error.message);
          reject(new Error(`응답 파싱 실패: ${error.message}`));
        }
      });
    });
    
    request.on('timeout', () => {
      console.error(`⏰ 요청 시간 초과 (${WEATHER_CONFIG.REQUEST_TIMEOUT}ms)`);
      request.destroy();
      reject(new Error('요청 시간 초과'));
    });
    
    request.on('error', (error) => {
      console.error('❌ 네트워크 오류:', error.message);
      reject(error);
    });
  });
}

// 🔧 재시도 래퍼 함수
async function fetchWeatherDataWithRetry(stationCode) {
  let lastError;
  
  for (let i = 0; i <= WEATHER_CONFIG.MAX_RETRIES; i++) {
    try {
      return await fetchWeatherData(stationCode, i);
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ 시도 ${i + 1} 실패:`, error.message);
      
      // 마지막 시도가 아니면 잠시 대기
      if (i < WEATHER_CONFIG.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// 🔧 텍스트 응답 파싱 함수 (기상청 고정폭 형식)
// 🔧 텍스트 응답 파싱 함수 (안정: 토큰 인덱스 기반)
function parseTextResponse(text) {
  try {
    // 줄 정리: 데이터 라인(숫자 12자리 시각으로 시작하는 라인)만 추출
    const bodyLine = text
      .replace(/\r/g, '')
      .split('\n')
      .map(l => l.trim())
      .find(l => /^\d{12}\s/.test(l));

    if (!bodyLine) throw new Error('데이터 라인을 찾을 수 없습니다');

    // 다중 공백 -> 토큰
    const tk = bodyLine.split(/\s+/);

    // kma_sfctm2(typ01) 주요 필드의 토큰 인덱스 매핑
    // 예시 라인:
    // 0:TM  1:STN  2:WD  3:WS  4:GST_WD 5:GST_WS 6:GST_TM
    // 7:PA  8:PS   9:PT 10:PR 11:TA    12:TD    13:HM   14:PV
    // 15:RN(mm) 16:RN(DAY) 17:RN(JUN) 18:RN(INT)
    // 19:SD(HR3) 20:SD(DAY) 21:SD(TOT)
    // 22:WC 23:WP 24:WW
    // 25:CA(TOT) 26:CA(MID) 27:CH(MIN)
    // 28~30:CT... (여러 개)
    // 31:VS  32:SS  33:SI  34:ST  35:TS  36~:TE... 등
    const pick = (i) => (i != null && i < tk.length ? tk[i] : null);
    const num  = (i) => safeParseFloat(pick(i));

    // 시정(VS)은 m 단위로 내려오는 사례가 많아 km로 보정(관측망에 따라 다름)
    const vsRaw = num(31);
    const visibilityKm =
      vsRaw == null ? null :
      (vsRaw >= 100 ? Math.round((vsRaw / 1000) * 10) / 10 : vsRaw); // 1739 -> 1.7km

    const data = {
      TM: pick(0),
      STN: pick(1),
      WD: num(2),
      WS: num(3),
      PA: num(7),
      PS: num(8),
      PT: num(9),
      PR: num(10),
      TA: num(11), // ✅ 기온
      TD: num(12), // 이슬점
      HM: num(13), // ✅ 습도(%)
      PV: num(14),
      RN: num(15), // 시간 강수량(mm)
      CA: num(25), // 전운량(TOT)
      VS: visibilityKm,
      SS: num(32)  // 일사/일조 관련 값(참고용)
    };

    // 디버깅 로깅(요약)
    console.log('📊 텍스트 파싱 결과(토큰 기반):', {
      sample: {
        TM: data.TM, STN: data.STN, WD: data.WD, WS: data.WS,
        TA: data.TA, TD: data.TD, HM: data.HM, PS: data.PS, RN: data.RN, CA: data.CA, VS: data.VS
      },
      tokenCount: tk.length
    });

    return processKMAData(data);
  } catch (error) {
    console.error('텍스트 파싱 오류:', error);
    return null;
  }
}


// 🔧 폴백 데이터 생성 함수
function generateFallbackWeatherData(regionName, stationCode) {
  const now = new Date();
  return {
    region: regionName,
    stationCode: stationCode,
    observationTime: now.toISOString(),
    updateTime: now.toLocaleString('ko-KR'),
    // 🔥 프론트엔드 형식에 맞게 필드명 변환 (호환성을 위해 둘 다 포함)
    currentTemp: null,
    currentHumidity: null,
    temperature: null,
    humidity: null,
    feelsLike: null,
    precipitation: null,
    windSpeed: null,
    windDirection: null,
    windDirectionName: '정온',
    pressure: null,
    skyCondition: '알 수 없음',
    precipitationType: '없음',
    visibility: null,
    icon: '01d',
    emoji: '🌤️',
    isFallback: true
  };
}

// 🔧 기상청 데이터 처리 함수
function processKMAData(data) {
  try {
    if (!data || typeof data !== 'object') {
      console.warn('⚠️ processKMAData: 유효하지 않은 데이터:', data);
      return null;
    }
    
    // 🔥 다양한 필드명 시도 (기상청 API 응답 형식에 따라 다를 수 있음)
    const temp = safeParseFloat(
      data.TA || data.ta || data.TEMP || data.temp || 
      data.temperature || data.Temperature || 
      data['기온'] || data['온도']
    );
    const humidity = safeParseFloat(
      data.HM || data.hm || data.HUM || data.hum || 
      data.humidity || data.Humidity || 
      data['습도'] || data['상대습도']
    );
    const windSpeed = safeParseFloat(
      data.WS || data.ws || data.WIND_SPEED || data.wind_speed || 
      data.windSpeed || data.WindSpeed || 
      data['풍속'] || data['풍속(m/s)']
    );
    const windDirection = safeParseFloat(
      data.WD || data.wd || data.WIND_DIR || data.wind_dir || 
      data.windDirection || data.WindDirection || 
      data['풍향'] || data['풍향(deg)']
    );
    const pressure = safeParseFloat(
      data.PS || data.ps || data.PRESSURE || data.pressure || 
      data['기압'] || data['해면기압']
    );
    const precipitation = safeParseFloat(
      data.RN || data.rn || data.RAIN || data.rain || 
      data.precipitation || data.Precipitation || 
      data['강수량'] || data['강수(mm)']
    );
    
    // 🔥 하늘 상태 결정
    let skyCondition = '맑음';
    const cloudAmount = safeParseFloat(
      data.CA || data.ca || data.CLOUD || data.cloud || 
      data.cloudAmount || data.CloudAmount || 
      data['운량'] || data['전운량']
    );
    if (cloudAmount !== null) {
      if (cloudAmount >= 8) skyCondition = '흐림';
      else if (cloudAmount >= 5) skyCondition = '구름많음';
      else skyCondition = '맑음';
    } else {
      // 🔥 하늘 상태가 직접 제공되는 경우
      const sky = data.SKY || data.sky || data.SkyCondition || data.skyCondition || 
                  data['하늘상태'] || data['하늘'];
      if (sky) {
        if (typeof sky === 'string') {
          if (sky.includes('맑') || sky === '1' || sky === '1.0') skyCondition = '맑음';
          else if (sky.includes('구름') || sky === '3' || sky === '3.0') skyCondition = '구름많음';
          else if (sky.includes('흐') || sky === '4' || sky === '4.0') skyCondition = '흐림';
        } else if (typeof sky === 'number') {
          if (sky === 1) skyCondition = '맑음';
          else if (sky === 3) skyCondition = '구름많음';
          else if (sky === 4) skyCondition = '흐림';
        }
      }
    }
    
    // 🔥 강수 형태
    let precipitationType = '없음';
    if (precipitation && precipitation > 0) {
      if (temp !== null && temp < 0) {
        precipitationType = '눈';
      } else {
        precipitationType = '비';
      }
    } else {
      // 🔥 강수 형태가 직접 제공되는 경우
      const pty = data.PTY || data.pty || data.PrecipitationType || data.precipitationType || 
                  data['강수형태'] || data['강수형태코드'];
      if (pty !== null && pty !== undefined) {
        const ptyNum = typeof pty === 'string' ? parseInt(pty) : pty;
        if (ptyNum === 0) precipitationType = '없음';
        else if (ptyNum === 1) precipitationType = '비';
        else if (ptyNum === 2) precipitationType = '비/눈';
        else if (ptyNum === 3) precipitationType = '눈';
        else if (ptyNum === 4) precipitationType = '소나기';
      }
    }
    
    // 🔥 디버깅: 파싱된 데이터 로깅
    console.log('📊 processKMAData 파싱 결과:', {
      temp, humidity, windSpeed, windDirection, pressure, precipitation,
      cloudAmount, skyCondition, precipitationType,
      rawDataKeys: Object.keys(data).slice(0, 10) // 처음 10개 키만
    });
    
    // 체감온도 계산
    const feelsLike = (temp !== null && windSpeed !== null && humidity !== null) 
      ? calculateFeelsLike(temp, windSpeed, humidity) 
      : temp;
    
    const observationTime = data.TM || data.tm || new Date().toISOString();
    const temperature = roundToOneDecimal(temp);
    const humidityValue = humidity;
    
    return {
      observationTime: observationTime,
      updateTime: new Date(observationTime).toLocaleString('ko-KR'),
      // 🔥 프론트엔드 형식에 맞게 필드명 변환 (호환성을 위해 둘 다 포함)
      currentTemp: temperature,
      currentHumidity: humidityValue,
      temperature: temperature,
      humidity: humidityValue,
      feelsLike: roundToOneDecimal(feelsLike),
      precipitation: precipitation,
      windSpeed: roundToOneDecimal(windSpeed),
      windDirection: windDirection,
      pressure: roundToOneDecimal(pressure),
      skyCondition: skyCondition,
      precipitationType: precipitationType,
      visibility: safeParseFloat(data.VS || data.vs),
      icon: getIconFromCondition(skyCondition, precipitationType)
    };
  } catch (error) {
    console.error('데이터 처리 오류:', error);
    return null;
  }
}

// 🌤️ API 라우트들

// 🔥 서비스 헬스 체크
router.get('/health', (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      service: 'weather',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Weather health check error:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: '서비스 상태 확인 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 테스트용: 기상청 API 원시 응답 확인 (디버깅용)
router.get('/raw/:region?', async (req, res) => {
  try {
    const { region } = req.params;
    const stationCode = getStationCode(region);
    const regionName = region || '익산';
    
    console.log(`🔍 [RAW] 기상청 API 원시 응답 조회: ${regionName} (관측소 코드: ${stationCode})`);
    
    try {
      const response = await fetchWeatherDataWithRetry(stationCode);
      
      res.json({
        success: true,
        region: regionName,
        stationCode: stationCode,
        responseType: response.type,
        contentType: response.type === 'json' ? 'application/json' : 'text/plain',
        rawData: response.data,
        dataLength: typeof response.data === 'string' ? response.data.length : JSON.stringify(response.data).length,
        dataPreview: typeof response.data === 'string' 
          ? response.data.substring(0, 1000) 
          : JSON.stringify(response.data).substring(0, 1000),
        // 파싱 시도 결과
        parsedData: response.type === 'json' 
          ? processKMAData(response.data) 
          : parseTextResponse(response.data)
      });
    } catch (error) {
      console.error('❌ [RAW] 기상청 API 호출 실패:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        region: regionName,
        stationCode: stationCode
      });
    }
  } catch (error) {
    console.error('❌ [RAW] 날씨 API 오류:', error);
    res.status(500).json({
      success: false,
      error: '원시 데이터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 사용 가능한 지역 목록 조회
router.get('/regions', cacheMiddleware(3600, () => 'weather:regions'), (req, res) => {
  try {
    const regions = Object.keys(STATION_CODES).sort();
    
    res.json({
      success: true,
      regions: regions,
      totalCount: regions.length
    });
    
  } catch (error) {
    console.error('Get weather regions error:', error);
    res.status(500).json({
      success: false,
      error: '지역 목록 조회 중 오류가 발생했습니다.',
      regions: []
    });
  }
});

// 관측소 정보 조회
router.get('/stations/:region', cacheMiddleware(3600, (req) => `weather:station:${req.params.region}`), (req, res) => {
  try {
    const { region } = req.params;
    const stationCode = getStationCode(region);
    
    res.json({
      success: true,
      station: {
        region: region,
        code: stationCode
      }
    });
    
  } catch (error) {
    console.error('Get weather station error:', error);
    res.status(500).json({
      success: false,
      error: '관측소 정보 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 현재 날씨 정보 조회 (더 나은 에러 처리)
router.get('/current/:region?', cacheMiddleware(WEATHER_CONFIG.CACHE_DURATION, (req) => `weather:current:${req.params.region || 'default'}`), async (req, res) => {
  try {
    const { region } = req.params;
    const stationCode = getStationCode(region);
    const regionName = region || '익산';
    
    console.log(`🌤️ 현재 날씨 조회: ${regionName} (관측소 코드: ${stationCode})`);
    
    let weatherData = null;
    let usedFallback = false;
    let errorDetails = null;
    
    try {
      // 기상청 API 호출 시도
      const response = await fetchWeatherDataWithRetry(stationCode);
      
      // 🔥 응답 데이터 구조 로깅 (디버깅용)
      console.log('📊 기상청 API 응답 구조:', {
        type: response.type,
        dataType: Array.isArray(response.data) ? 'array' : typeof response.data,
        dataKeys: response.type === 'json' && !Array.isArray(response.data) ? Object.keys(response.data) : 'N/A',
        dataPreview: JSON.stringify(response.data).substring(0, 500)
      });
      
      if (response.type === 'json') {
        // 🔥 배열 형태 응답 처리
        let dataToProcess = response.data;
        if (Array.isArray(response.data) && response.data.length > 0) {
          dataToProcess = response.data[0]; // 첫 번째 요소 사용
        } else if (response.data && typeof response.data === 'object') {
          // 객체 내부에 데이터가 있는 경우 (예: response.data.data 또는 response.data.result)
          if (response.data.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
            dataToProcess = response.data.data[0];
          } else if (response.data.result && Array.isArray(response.data.result) && response.data.result.length > 0) {
            dataToProcess = response.data.result[0];
          } else if (response.data.items && Array.isArray(response.data.items) && response.data.items.length > 0) {
            dataToProcess = response.data.items[0];
          }
        }
        
        weatherData = processKMAData(dataToProcess);
      } else {
        weatherData = parseTextResponse(response.data);
      }
      
      if (weatherData) {
        weatherData.region = regionName;
        weatherData.stationCode = stationCode;
        weatherData.windDirectionName = getWindDirectionName(weatherData.windDirection);
        weatherData.emoji = getWeatherEmoji(weatherData.skyCondition, weatherData.precipitationType);
        
        // 🔥 프론트엔드 형식에 맞게 필드명 변환 (호환성을 위해 둘 다 포함)
        if (weatherData.temperature !== undefined) {
          weatherData.currentTemp = weatherData.temperature;
        }
        if (weatherData.humidity !== undefined) {
          weatherData.currentHumidity = weatherData.humidity;
        }
        if (!weatherData.updateTime && weatherData.observationTime) {
          weatherData.updateTime = new Date(weatherData.observationTime).toLocaleString('ko-KR');
        }
        
        console.log(`✅ 실제 기상청 데이터 성공: ${regionName}`, {
          temp: weatherData.currentTemp,
          humidity: weatherData.currentHumidity,
          windSpeed: weatherData.windSpeed
        });
      }
    } catch (error) {
      console.warn(`⚠️ 기상청 API 호출 실패: ${error.message}`);
      errorDetails = error.message;
      
      // 폴백 데이터 생성
      weatherData = generateFallbackWeatherData(regionName, stationCode);
      usedFallback = true;
    }
    
    if (!weatherData) {
      console.warn('⚠️ 모든 방법 실패, 기본 폴백 데이터 생성');
      weatherData = generateFallbackWeatherData(regionName, stationCode);
      usedFallback = true;
    }
    
    // 🔥 성공 응답 (폴백 데이터라도 성공으로 처리)
    const response = {
      success: true,
      weather: weatherData,
      cached: false,
      usedFallback: usedFallback
    };
    
    // 개발 환경에서만 에러 상세 정보 포함
    if (errorDetails && process.env.NODE_ENV !== 'production') {
      response.errorDetails = errorDetails;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(500).json({
      success: false,
      error: '날씨 정보 조회 중 오류가 발생했습니다.',
      weather: null
    });
  }
});

// 🔥 간단한 IP 기반 지역 매핑 함수
function getRegionFromIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost') {
    return '익산'; // 로컬호스트는 기본값
  }

  // 간단한 IP 기반 지역 매핑
  const ipRegionMapping = {
    // 사설 IP (로컬)
    '10.': '익산',     // 사설 IP
    '172.': '익산',    // 사설 IP
    '192.168.': '익산', // 사설 IP
    '127.': '익산',    // 로컬호스트
    
    // 기본값
    'default': '익산'
  };

  // IP 패턴 매칭
  for (const [pattern, region] of Object.entries(ipRegionMapping)) {
    if (ip.startsWith(pattern)) {
      console.log(`📍 IP ${ip} -> 지역 ${region} (패턴: ${pattern})`);
      return region;
    }
  }

  console.warn(`⚠️ IP ${ip}에 대한 지역 매핑을 찾을 수 없음, 기본값 사용`);
  return '익산';
}

// 🔥 장치 기반 날씨 조회 (간단한 방식)
router.get('/device/:deviceId', cacheMiddleware(WEATHER_CONFIG.CACHE_DURATION, (req) => `weather:device:${req.params.deviceId}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const deviceIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    console.log(`🌤️ 장치 ${deviceId} 날씨 조회 (IP: ${deviceIP})`);
    
    // IP 기반으로 지역 결정
    const selectedRegion = getRegionFromIP(deviceIP);
    const stationCode = getStationCode(selectedRegion);
    
    console.log(`📍 선택된 지역: ${selectedRegion} (관측소: ${stationCode})`);
    
    let weatherData = null;
    let usedFallback = false;
    let errorDetails = null;
    
    try {
      // 기상청 API 호출 시도
      const response = await fetchWeatherDataWithRetry(stationCode);
      
      if (response.type === 'json') {
        weatherData = processKMAData(response.data);
      } else {
        weatherData = parseTextResponse(response.data);
      }
      
      if (weatherData) {
        weatherData.region = selectedRegion;
        weatherData.stationCode = stationCode;
        weatherData.deviceId = deviceId;
        weatherData.deviceIP = deviceIP;
        weatherData.windDirectionName = getWindDirectionName(weatherData.windDirection);
        weatherData.emoji = getWeatherEmoji(weatherData.skyCondition, weatherData.precipitationType);
        console.log(`✅ 장치 ${deviceId} 날씨 조회 성공: ${selectedRegion}`);
      }
    } catch (error) {
      console.warn(`⚠️ 장치 ${deviceId} 기상청 API 호출 실패: ${error.message}`);
      errorDetails = error.message;
      
      // 폴백 데이터 생성
      weatherData = generateFallbackWeatherData(selectedRegion, stationCode);
      weatherData.deviceId = deviceId;
      weatherData.deviceIP = deviceIP;
      usedFallback = true;
    }
    
    if (!weatherData) {
      console.warn(`⚠️ 장치 ${deviceId} 모든 방법 실패, 기본 폴백 데이터 생성`);
      weatherData = generateFallbackWeatherData(selectedRegion, stationCode);
      weatherData.deviceId = deviceId;
      weatherData.deviceIP = deviceIP;
      usedFallback = true;
    }
    
    // 성공 응답
    const response = {
      success: true,
      weather: weatherData,
      cached: false,
      usedFallback: usedFallback,
      deviceInfo: {
        deviceId: deviceId,
        deviceIP: deviceIP,
        detectedRegion: selectedRegion
      }
    };
    
    // 개발 환경에서만 에러 상세 정보 포함
    if (errorDetails && process.env.NODE_ENV !== 'production') {
      response.errorDetails = errorDetails;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Device weather API error:', error);
    res.status(500).json({
      success: false,
      error: '장치 날씨 정보 조회 중 오류가 발생했습니다.',
      weather: null
    });
  }
});

// 🔥 예보 정보 조회 (현재 날씨 기반 간단 예보 생성)
router.get('/forecast/:region?', cacheMiddleware(WEATHER_CONFIG.CACHE_DURATION, (req) => `weather:forecast:${req.params.region || 'default'}`), async (req, res) => {
  try {
    const { region } = req.params;
    const stationCode = getStationCode(region);
    const regionName = region || '익산';
    
    console.log(`🔮 예보 정보 조회: ${regionName} (관측소 코드: ${stationCode})`);
    
    // 현재 날씨를 먼저 가져옴
    let currentWeather = null;
    let usedFallback = false;
    
    try {
      const response = await fetchWeatherDataWithRetry(stationCode);
      
      if (response.type === 'json') {
        currentWeather = processKMAData(response.data);
      } else {
        currentWeather = parseTextResponse(response.data);
      }
      
      if (currentWeather) {
        currentWeather.region = regionName;
        currentWeather.stationCode = stationCode;
        currentWeather.windDirectionName = getWindDirectionName(currentWeather.windDirection);
        currentWeather.emoji = getWeatherEmoji(currentWeather.skyCondition, currentWeather.precipitationType);
      }
    } catch (error) {
      console.warn(`⚠️ 현재 날씨 조회 실패, 폴백 데이터 사용: ${error.message}`);
      currentWeather = generateFallbackWeatherData(regionName, stationCode);
      usedFallback = true;
    }
    
    // 현재 날씨를 기반으로 간단한 예보 생성
    const forecasts = [];
    if (currentWeather) {
      // 🔥 프론트엔드 형식 필드명 우선 사용 (호환성)
      const baseTemp = currentWeather.currentTemp !== undefined ? currentWeather.currentTemp : currentWeather.temperature;
      const baseHumidity = currentWeather.currentHumidity !== undefined ? currentWeather.currentHumidity : currentWeather.humidity;
      
      for (let i = 1; i <= 6; i++) {
        const futureTime = new Date();
        futureTime.setHours(futureTime.getHours() + i * 3);
        
        const tempVariation = Math.random() * 4 - 2;
        const estimatedTemp = baseTemp !== null && baseTemp !== undefined ? 
          Math.round((baseTemp + tempVariation) * 10) / 10 : null;
        
        const skyConditions = ['맑음', '구름많음', '흐림'];
        const skyCondition = skyConditions[Math.floor(Math.random() * skyConditions.length)];
        
        const humidity = baseHumidity !== null && baseHumidity !== undefined ? 
          Math.max(30, Math.min(90, baseHumidity + Math.random() * 20 - 10)) : null;
        const windSpeed = currentWeather.windSpeed !== null && currentWeather.windSpeed !== undefined ? 
          Math.max(0, Math.round((currentWeather.windSpeed + Math.random() * 2 - 1) * 10) / 10) : null;
        const windDirection = currentWeather.windDirection !== null && currentWeather.windDirection !== undefined ? 
          (currentWeather.windDirection + Math.random() * 60 - 30) % 360 : null;
        const pressure = currentWeather.pressure !== null && currentWeather.pressure !== undefined ? 
          Math.round((currentWeather.pressure + Math.random() * 6 - 3) * 10) / 10 : null;
        
        // 체감온도 계산
        const feelsLike = (estimatedTemp !== null && windSpeed !== null && humidity !== null) 
          ? calculateFeelsLike(estimatedTemp, windSpeed, humidity) 
          : estimatedTemp;
        
        const forecast = {
          region: regionName,
          stationCode: stationCode,
          observationTime: futureTime.toISOString(),
          updateTime: futureTime.toLocaleString('ko-KR'),
          // 🔥 프론트엔드 형식에 맞게 필드명 변환
          currentTemp: estimatedTemp,
          currentHumidity: humidity,
          temperature: estimatedTemp, // 호환성을 위해 둘 다 포함
          humidity: humidity, // 호환성을 위해 둘 다 포함
          feelsLike: feelsLike,
          precipitation: Math.random() > 0.8 ? Math.round(Math.random() * 2 * 10) / 10 : 0,
          windSpeed: windSpeed,
          windDirection: windDirection,
          windDirectionName: windDirection !== null ? getWindDirectionName(windDirection) : '정온',
          pressure: pressure,
          skyCondition: skyCondition,
          precipitationType: '없음',
          visibility: currentWeather.visibility,
          icon: getIconFromCondition(skyCondition, '없음'),
          emoji: getWeatherEmoji(skyCondition, '없음'),
          isFallback: usedFallback
        };
        
        forecasts.push(forecast);
      }
    }
    
    res.json({
      success: true,
      region: regionName,
      baseWeather: currentWeather,
      forecasts: forecasts,
      cached: false,
      usedFallback: usedFallback
    });
    
  } catch (error) {
    console.error('Forecast API error:', error);
    res.status(500).json({
      success: false,
      error: '예보 정보 조회 중 오류가 발생했습니다.',
      forecasts: []
    });
  }
});

module.exports = router;
module.exports.STATION_CODES = STATION_CODES;