// routes/alerts.js - 16-19 센서 타입 추가된 버전
const express = require('express');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// 🔥 알림톡 설정
const KAKAO_CONFIG = {
  userid: 'etcom262',
  profile: 'd3393e690b02911e022c8e305920de8a3b6520f2',
  smsSender: '01022957774',
  apiUrl: 'https://alimtalk-api.bizmsg.kr/v2/sender/send'
};

// 🔥 백엔드 sensors.js와 일치하는 압축된 센서 데이터 해제 함수 (16-19 타입 추가)
function decompressUnifiedData(compressed) {
  const sensorTypes = {
    1: { name: 'SHT20', protocol: 'i2c', values: ['temperature', 'humidity'] },
    2: { name: 'BH1750', protocol: 'i2c', values: ['light_level'] },
    3: { name: 'ADS1115', protocol: 'i2c', values: ['ph', 'ec'] },
    4: { name: 'scd41', protocol: 'i2c', values: ['co2_ppm'] },
    5: { name: 'DS18B20', protocol: 'i2c', values: ['temperature'] },
    6: { name: 'BH1750', protocol: 'i2c', values: ['light_level'] },   // ✅ 추가
    7: { name: 'MHZ19', protocol: 'pwm', values: ['co2_ppm'] },
    11: { name: 'MODBUS_TH', protocol: 'modbus', values: ['temperature', 'humidity'] },
    12: { name: 'MODBUS_PRESSURE', protocol: 'modbus', values: ['pressure'] },
    13: { name: 'MODBUS_FLOW', protocol: 'modbus', values: ['flow_rate'] },
    14: { name: 'MODBUS_RELAY', protocol: 'modbus', values: ['relay_status'] },
    15: { name: 'MODBUS_POWER', protocol: 'modbus', values: ['voltage', 'current'] },
    16: { name: 'WIND_DIRECTION', protocol: 'modbus', values: ['gear_direction', 'degree_direction', 'direction_text'] },
    17: { name: 'WIND_SPEED', protocol: 'modbus', values: ['wind_speed_ms', 'wind_scale', 'wind_condition'] },
    18: { name: 'PRECIPITATION', protocol: 'modbus', values: ['precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity', 'temperature', 'humidity', 'precip_icon'] },
    19: { name: 'SOIL_SENSOR', protocol: 'modbus', values: ['soil_humidity', 'soil_temperature', 'soil_ec', 'soil_ph', 'moisture_status', 'ph_status', 'ec_status', 'nitrogen', 'phosphorus', 'potassium'] }
  };

  // 🔥 먼저 모든 센서를 파싱하고, 동종 센서에 대해 채널 재계산
  const rawSensors = compressed.s.map(s => {
    const sensorType = s[1];
    const typeInfo = sensorTypes[sensorType] || {
      name: 'UNKNOWN',
      protocol: 'unknown',
      values: []
    };

    const rawValues = s.slice(4);
    let values = [];
    let valueNames = [];

      // 🔥 센서 타입별 값 변환 로직 (sensors.js와 동일)
      switch (sensorType) {
        case 1: // SHT20
          values = [rawValues[0] / 100, rawValues[1] / 100];
          valueNames = ['temperature', 'humidity'];
          break;
        case 2: // BH1750
          values = [rawValues[0] / 10];
          valueNames = ['light_level'];
          break;
        case 3: // ADS1115 - pH/EC/WaterTemp
          values = [rawValues[0] / 100, rawValues[1] / 100, rawValues[2] / 100];
          valueNames = ['ph', 'ec', 'water_temp'];
          break;
        case 4: // scd41
          values = [rawValues[0]];
          valueNames = ['co2_ppm'];
          break;
        case 5: // DS18B20
          values = [rawValues[0] / 100];
          valueNames = ['temperature'];
          break;

        case 6: // BH1750 - 조도 (×10 → lux)
          values = [rawValues[0] / 10];
          valueNames = ['light_level'];
          break;

        case 16: // 풍향센서
          const gearDirection = rawValues[0];
          const degreeDirection = rawValues[1];
          const directions = ['북풍(N)', '북동풍(NE)', '동풍(E)', '남동풍(SE)',
            '남풍(S)', '남서풍(SW)', '서풍(W)', '북서풍(NW)'];
          let windDirectionStr = '';
          if (gearDirection >= 0 && gearDirection <= 7) {
            windDirectionStr = directions[gearDirection];
          } else {
            if (degreeDirection >= 0 && degreeDirection < 22.5) windDirectionStr = '북풍(N)';
            else if (degreeDirection < 67.5) windDirectionStr = '북동풍(NE)';
            else if (degreeDirection < 112.5) windDirectionStr = '동풍(E)';
            else if (degreeDirection < 157.5) windDirectionStr = '남동풍(SE)';
            else if (degreeDirection < 202.5) windDirectionStr = '남풍(S)';
            else if (degreeDirection < 247.5) windDirectionStr = '남서풍(SW)';
            else if (degreeDirection < 292.5) windDirectionStr = '서풍(W)';
            else if (degreeDirection < 337.5) windDirectionStr = '북서풍(NW)';
            else windDirectionStr = '북풍(N)';
          }
          values = [gearDirection, degreeDirection, windDirectionStr];
          valueNames = ['gear_direction', 'degree_direction', 'direction_text'];
          break;
        case 17: // 풍속센서
          const windSpeedMs = rawValues[0] / 10.0;
          let windScale = '';
          let windCondition = '';
          if (windSpeedMs === 0) {
            windScale = '무풍'; windCondition = '고요';
          } else if (windSpeedMs < 0.2) {
            windScale = '감지한계'; windCondition = '연기 방향 감지 곤란';
          } else if (windSpeedMs < 1.5) {
            windScale = '실바람'; windCondition = '연기 방향으로 감지';
          } else if (windSpeedMs < 3.3) {
            windScale = '남실바람'; windCondition = '바람이 얼굴에 느껴짐';
          } else if (windSpeedMs < 5.4) {
            windScale = '산들바람'; windCondition = '나뭇잎이 흔들림';
          } else if (windSpeedMs < 7.9) {
            windScale = '건들바람'; windCondition = '작은 가지가 흔들림';
          } else if (windSpeedMs < 10.7) {
            windScale = '흔들바람'; windCondition = '큰 가지가 흔들림';
          } else if (windSpeedMs < 13.8) {
            windScale = '된바람'; windCondition = '나무 전체가 흔들림';
          } else if (windSpeedMs < 17.1) {
            windScale = '센바람'; windCondition = '걷기 곤란';
          } else {
            windScale = '강풍'; windCondition = '심한 손상 가능';
          }
          values = [windSpeedMs, windScale, windCondition];
          valueNames = ['wind_speed_ms', 'wind_scale', 'wind_condition'];
          break;
        case 18: // 강우강설센서
          const precipStatusCode = rawValues[0];
          const moistureLvl = rawValues[1];
          const temp2 = rawValues[2] / 100;
          const humidity2 = rawValues[3];
          let precipText = '';
          let precipEmoji = '';
          switch (precipStatusCode) {
            case 0: precipText = '건조'; precipEmoji = '☀️'; break;
            case 1: precipText = '강우'; precipEmoji = '🌧️'; break;
            case 2: precipText = '강설'; precipEmoji = '🌨️'; break;
            default: precipText = '알 수 없음'; precipEmoji = '❓'; break;
          }
          let moistureIntens = '';
          if (precipStatusCode > 0) {
            if (moistureLvl > 3000) moistureIntens = '강함';
            else if (moistureLvl > 1500) moistureIntens = '보통';
            else if (moistureLvl > 500) moistureIntens = '약함';
            else moistureIntens = '미약';
          } else {
            if (moistureLvl > 500) moistureIntens = '잔여수분';
            else moistureIntens = '완전건조';
          }
          values = [precipStatusCode, precipText, moistureLvl, moistureIntens, temp2, humidity2, precipEmoji];
          valueNames = ['precip_status', 'precip_status_text', 'moisture_level', 'moisture_intensity', 'temperature', 'humidity', 'precip_icon'];
          break;
        case 19: // 토양센서 (습도 포함)
          const savedPH = rawValues[0] / 100;
          const savedEC = rawValues[1] / 100;
          const savedTemp = rawValues[2] / 100;  // 실제 토양 온도값
          const savedHumidity = rawValues[3];    // 토양 습도 (%)
          
          let phStatus = '';
          if (savedPH >= 8.5) phStatus = '🔵강알칼리';
          else if (savedPH >= 7.5) phStatus = '🟦약알칼리';
          else if (savedPH >= 6.5) phStatus = '🟢중성';
          else if (savedPH >= 5.5) phStatus = '🟡약산성';
          else if (savedPH >= 4.5) phStatus = '🟠산성';
          else phStatus = '🔴강산성';
          
          let ecStatus = '';
          if (savedEC >= 3.0) ecStatus = '⚡고농도';
          else if (savedEC >= 2.0) ecStatus = '🧂높음';
          else if (savedEC >= 1.0) ecStatus = '📊보통';
          else if (savedEC >= 0.5) ecStatus = '💎낮음';
          else ecStatus = '🌊매우낮음';
          
          let moistureStatus = '';
          if (savedHumidity >= 80) moistureStatus = '💧과습';
          else if (savedHumidity >= 60) moistureStatus = '💦충분';
          else if (savedHumidity >= 40) moistureStatus = '🌿적정';
          else if (savedHumidity >= 20) moistureStatus = '🌵건조';
          else moistureStatus = '🏜️매우건조';
          
          values = [savedPH, savedEC, savedTemp, savedHumidity, phStatus, ecStatus, moistureStatus, 0, 0, 0];
          valueNames = ['soil_ph', 'soil_ec', 'soil_temperature', 'soil_humidity', 'ph_status', 'ec_status', 'moisture_status', 'nitrogen', 'phosphorus', 'potassium'];
          break;
        default:
          if (sensorType >= 11) {
            values = [rawValues[0] / 100, rawValues[1] / 100];
            valueNames = ['value1', 'value2'];
          } else {
            values = rawValues.map(v => v / 100);
            valueNames = typeInfo.values.slice(0, rawValues.length);
          }
          break;
      }

      const slaveId = s[2]; // 🔥 channel 자리에 실제로는 slaveId가 들어있음
      const statusRaw = s[3];
      const status = statusRaw > 0 ? 1 : 0; // 🔥 status 정규화

      return {
        sensor_id: s[0],
        type: sensorType,
        protocol: typeInfo.protocol,
        channel: slaveId, // 🔥 임시: 실제로는 slaveId
        slaveId: slaveId, // 🔥 slaveId 명시적으로 저장
        status: status,
        active: status === 1,
        values: values,
        value_names: valueNames,
        _tempForChannelRecalc: true // 🔥 채널 재계산 플래그
      };
    });

  // 🔥 동종 센서에 대해 채널 번호 1,2,3... 재할당
  const channelCounters = {};
  rawSensors.forEach(sensor => {
    if (sensor._tempForChannelRecalc) {
      const typeKey = sensor.type;
      if (!channelCounters[typeKey]) {
        channelCounters[typeKey] = 0;
      }
      channelCounters[typeKey]++;
      sensor.channel = channelCounters[typeKey]; // 🔥 실제 채널 번호 할당
      delete sensor._tempForChannelRecalc;
    }
  });

  // 🔥 센서 이름 생성 (재할당된 채널 번호 사용)
  rawSensors.forEach(sensor => {
    const typeInfo = sensorTypes[sensor.type] || {
      name: 'UNKNOWN',
      protocol: 'unknown'
    };
    sensor.name = `${typeInfo.name}_CH${sensor.channel}`;
  });

  return {
    device_id: compressed.d,
    timestamp: compressed.t,
    sensor_count: compressed.c,
    protocols: compressed.p,
    sensors: rawSensors
  };
}

// 🔥 특정 센서에서 값 추출 (수정 없음)
function getSensorValue(sensorData, sensorName, valueIndex = 0) {
  if (!sensorData.sensors || !Array.isArray(sensorData.sensors)) {
    return null;
  }

  const sensor = sensorData.sensors.find(s => s.name === sensorName && s.active);

  if (!sensor) {
    return null;
  }

  if (sensor.values[valueIndex] === undefined) {
    return null;
  }

  return sensor.values[valueIndex];
}

// 🔥 업데이트된 알림 템플릿 생성 (16-19 센서 타입 추가)
function generateAlertTemplate(alertType, data) {
  const systemType = 'SmartFarm';
  const location = data.deviceLocation || '위치 정보 없음';

  // 센서 정보 추출 (확장된 버전)
  let sensorLabel = data.sensorName || '센서';
  let unit = '';

  if (data.sensorName) {
    const parts = data.sensorName.split('_');
    const sensorType = parts[0];

    const valueLabels = {
      'SHT20': ['온도', '습도'],
      'TSL2591': ['조도'],   // ✅ 추가
      'BH1750': ['조도'],    // ✅ 유지
      'ADS1115': ['pH', 'EC'],
      'scd41': ['CO2'],
      'DS18B20': ['온도'],
      'MODBUS_TH': ['온도', '습도'],
      'MODBUS_PRESSURE': ['압력'],
      'MODBUS_FLOW': ['유량'],
      'MODBUS_RELAY': ['릴레이상태'],
      'MODBUS_POWER': ['전압', '전류'],
      'WIND_DIRECTION': ['기어방향', '각도방향', '풍향'],
      'WIND_SPEED': ['풍속', '풍력계급', '상태'],
      'PRECIPITATION': ['강수상태', '강수상태텍스트', '수분레벨', '수분강도', '온도', '습도', '날씨아이콘'],
      'SOIL_SENSOR': ['토양수분', '토양온도', '토양EC', '토양pH', '수분상태', 'pH상태', 'EC상태', '질소', '인', '칼륨']
    };

    const units = {
      'SHT20': ['°C', '%'],
      'TSL2591': ['lux'],    // ✅ 추가
      'BH1750': ['lux'],    // ✅ 유지
      'ADS1115': ['', 'μS/cm'],
      'SCD41': ['ppm'],
      'DS18B20': ['°C'],
      'MODBUS_TH': ['°C', '%'],
      'MODBUS_PRESSURE': ['bar'],
      'MODBUS_FLOW': ['L/min'],
      'MODBUS_RELAY': [''],
      'MODBUS_POWER': ['V', 'A'],
      'WIND_DIRECTION': ['', '°', ''],
      'WIND_SPEED': ['m/s', '', ''],
      'PRECIPITATION': ['', '', '', '', '°C', '%', ''],
      'SOIL_SENSOR': ['%', '°C', 'μS/cm', '', '', '', '', 'mg/kg', 'mg/kg', 'mg/kg']
    };

    const labels = valueLabels[sensorType] || ['값'];
    const unitList = units[sensorType] || [''];

    sensorLabel = `${data.sensorName} - ${labels[data.valueIndex || 0] || '값'}`;
    unit = unitList[data.valueIndex || 0] || '';
  }

  if (alertType === 'alert') {
    const message = `${systemType} ${data.deviceName} 임계치 이상 알림

장치위치: ${location}
센서 현재 데이터 : ${sensorLabel} ${data.currentValue}${unit}
센서 설정 임계치 : ${data.thresholdValue}${unit}
발생 시간: ${data.timestamp}

센서데이터가 정상 범위로 복구될때 다시 알림을 발송드립니다.`;

    return {
      tmplId: 'seriallog3',
      title: `[${systemType}] 센서 알림`,
      message: message
    };
  } else {
    const message = `${systemType} ${data.deviceName} 범위 정상 복귀

장치위치: ${location}
센서 현재 데이터 : ${sensorLabel} ${data.currentValue}${unit}
센서 설정 임계치 : ${data.thresholdValue}${unit}
복귀 시간: ${data.timestamp}

현재 센서 상태가 임계치 범위 내로 정상 복구되었습니다`;

    return {
      tmplId: 'seriallog4',
      title: `[${systemType}] 센서 복구`,
      message: message
    };
  }
}

// 나머지 함수들은 동일하게 유지...
// (sendKakaoAlert, checkAlerts, checkDeviceAccess 등)

// 🔥 카카오 알림톡 발송
async function sendKakaoAlert(deviceId, alertType, alertData) {
  try {
    const info = await getOwnerPhonesAndDeviceInfo(deviceId);

    if (!info.owner || info.phones.length === 0) {
      console.warn(`⚠️ 수신 번호 없음: deviceId=${deviceId}`);
      return false;
    }

    // 메시지 템플릿(기존 로직 재사용)
    const template = generateAlertTemplate(alertType, {
      ...alertData,
      deviceName: info.device.name,
      deviceLocation: info.device.location,
      ownerName: info.owner.name
    });

    // 각 번호로 개별 발송 (병렬 처리)
    const tasks = info.phones.map(async (phn) => {
      const kakaoData = [{
        message_type: 'at',
        phn, // 이미 숫자만 남긴 상태
        profile: KAKAO_CONFIG.profile,
        tmplId: template.tmplId,
        msg: template.message,
        smsKind: 'L',
        msgSms: template.message,
        smsSender: KAKAO_CONFIG.smsSender,
        smsLmsTit: template.title,
        reserveDt: '00000000000000'
      }];

      try {
        const response = await fetch(KAKAO_CONFIG.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'userid': KAKAO_CONFIG.userid
          },
          body: JSON.stringify(kakaoData)
        });

        const result = await response.json();

        if (response.ok && result[0]?.code === 'success') {
          return { phone: phn, ok: true };
        } else {
          console.error(`❌ 카카오 알림톡 발송 실패: ${phn}`, result);
          return { phone: phn, ok: false, error: result };
        }
      } catch (err) {
        console.error(`❌ 카카오 알림톡 예외: ${phn}`, err);
        return { phone: phn, ok: false, error: err?.message || err };
      }
    });

    const results = await Promise.all(tasks);

    const successCount = results.filter(r => r.ok).length;
    const failCount = results.length - successCount;

    if (successCount === 0) {
      console.error(`❌ 전체 실패: deviceId=${deviceId}`, results);
      return false;
    }

    if (failCount > 0) {
      console.warn(`⚠️ 일부 실패: 성공 ${successCount} / 실패 ${failCount}`, results);
    }

    return true;
  } catch (error) {
    console.error('카카오 알림톡 다중 발송 오류:', error);
    return false;
  }
}

// 🔥 메인 알림 체크 함수 (수정 없음)
async function checkAlerts(deviceId, sensorData) {
  try {
    // 압축된 데이터인 경우 해제
    let processedData = sensorData;
    if (sensorData.c && sensorData.d && sensorData.s) {
      processedData = decompressUnifiedData(sensorData);
    }

    if (!processedData.sensors || !Array.isArray(processedData.sensors)) {
      return;
    }

    const alerts = await Database.query(
      `SELECT * FROM alert_settings 
       WHERE device_id = $1 AND is_active = true`,
      [deviceId]
    );

    for (const alert of alerts) {
      // 🔥 센서 이름이 필수 (레거시 알림은 건너뜀)
      if (!alert.sensor_name) {
        continue;
      }

      const sensorValue = getSensorValue(processedData, alert.sensor_name, alert.value_index || 0);

      if (sensorValue === null) {
        continue;
      }

      const originalThreshold = parseFloat(alert.threshold_value);
      const hysteresisOffset = 0.5;
      const currentState = alert.current_state || 'normal';

      let triggered = false;
      let recoveryTriggered = false;
      let newState = currentState;

      // 히스테리시스 로직
      if (alert.condition_type === 'above') {
        if (currentState === 'normal' && sensorValue > originalThreshold) {
          triggered = true;
          newState = 'alert';
        } else if (currentState === 'alert' && sensorValue <= (originalThreshold - hysteresisOffset)) {
          recoveryTriggered = true;
          newState = 'normal';
        }
      } else if (alert.condition_type === 'below') {
        if (currentState === 'normal' && sensorValue < originalThreshold) {
          triggered = true;
          newState = 'alert';
        } else if (currentState === 'alert' && sensorValue >= (originalThreshold + hysteresisOffset)) {
          recoveryTriggered = true;
          newState = 'normal';
        }
      }

      // 알림 발송
      if (triggered || recoveryTriggered) {
        const timestamp = new Date().toLocaleString('ko-KR');
        const logType = triggered ? 'alert' : 'recovery';
        const kakaoAlertType = triggered ? 'alert' : 'recovery';

        const message = triggered
          ? `🚨 ${alert.sensor_name} 알림: 값이 ${alert.condition_type === 'above' ? '기준값을 초과' : '기준값 미만'}했습니다. (현재: ${sensorValue}, 기준: ${originalThreshold})`
          : `✅ ${alert.sensor_name} 복구: 값이 정상 범위로 돌아왔습니다. (현재: ${sensorValue}, 기준: ${originalThreshold})`;

        // 데이터베이스 업데이트
        await Database.query('BEGIN');

        try {
          await Database.query(
            `UPDATE alert_settings 
             SET current_state = $1, last_alert_time = NOW(), last_sensor_value = $2, updated_at = NOW()
             WHERE id = $3`,
            [newState, sensorValue, alert.id]
          );

          await Database.query(
            `INSERT INTO alert_logs (device_id, sensor_type, sensor_name, value_index, condition_type, sensor_value, threshold_value, message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [deviceId, alert.sensor_type, alert.sensor_name, alert.value_index, logType, sensorValue, originalThreshold, message]
          );

          await Database.query('COMMIT');

        } catch (dbError) {
          await Database.query('ROLLBACK');
          throw dbError;
        }

        // 카카오 알림톡 발송
        const kakaoAlertData = {
          sensorName: alert.sensor_name,
          valueIndex: alert.value_index,
          currentValue: sensorValue,
          thresholdValue: originalThreshold,
          timestamp: timestamp
        };

        sendKakaoAlert(deviceId, kakaoAlertType, kakaoAlertData).catch(error => {
          console.error('카카오 알림톡 발송 오류:', error);
        });
      }
    }

  } catch (error) {
    console.error(`❌ 알림 체크 오류 [${deviceId}]:`, error);
  }
}

// 나머지 API 라우트들과 함수들은 동일하게 유지...
// (checkDeviceAccess, 모든 라우터 함수들, sendKakaoAlertToPhone 등)

// 🔥 디바이스 소유권 확인
async function checkDeviceAccess(userId, deviceId) {
  try {
    const result = await Database.query(
      `SELECT registered_by FROM devices WHERE device_id = $1`,
      [deviceId]
    );

    if (result.length === 0) {
      throw new Error('존재하지 않는 디바이스입니다.');
    }

    if (result[0].registered_by !== userId) {
      throw new Error('이 디바이스에 대한 접근 권한이 없습니다.');
    }

    return true;
  } catch (error) {
    console.error('디바이스 접근 권한 확인 오류:', error);
    throw error;
  }
}

// 🔥 API 라우트들

// 알림 설정 조회
router.get('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    const alerts = await Database.query(
      `SELECT id, sensor_type, sensor_name, value_index, condition_type, threshold_value, is_active, created_at
       FROM alert_settings 
       WHERE device_id = $1
       ORDER BY created_at DESC`,
      [deviceId]
    );

    res.json({
      success: true,
      data: alerts,
      deviceId: deviceId
    });

  } catch (error) {
    console.error('알림 설정 조회 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 설정을 불러올 수 없습니다.'
    });
  }
});

// 알림 설정 저장/업데이트
router.post('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      id,
      sensor_type,
      sensor_name,
      value_index,
      condition_type,
      threshold_value,
      is_active
    } = req.body;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    // 🔥 필수 필드 검증
    if (!sensor_type || !sensor_name || !condition_type || threshold_value === undefined || value_index === undefined) {
      return res.status(400).json({
        success: false,
        message: '필수 필드가 누락되었습니다. (sensor_name, value_index는 필수)'
      });
    }

    let result;

    if (id) {
      // 업데이트
      result = await Database.query(
        `UPDATE alert_settings 
         SET sensor_type = $1, sensor_name = $2, value_index = $3, condition_type = $4, threshold_value = $5, is_active = $6, updated_at = NOW()
         WHERE id = $7 AND device_id = $8
         RETURNING *`,
        [sensor_type, sensor_name, value_index, condition_type, threshold_value, is_active, id, deviceId]
      );
    } else {
      // 새로 생성
      result = await Database.query(
        `INSERT INTO alert_settings (device_id, sensor_type, sensor_name, value_index, condition_type, threshold_value, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [deviceId, sensor_type, sensor_name, value_index, condition_type, threshold_value, is_active]
      );
    }

    res.json({
      success: true,
      message: '알림 설정이 저장되었습니다.',
      data: result[0]
    });

  } catch (error) {
    console.error('알림 설정 저장 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 설정 저장에 실패했습니다.'
    });
  }
});

// 알림 설정 삭제
router.delete('/:deviceId/:alertId', authenticateToken, async (req, res) => {
  try {
    const { deviceId, alertId } = req.params;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    const result = await Database.query(
      `DELETE FROM alert_settings 
       WHERE id = $1 AND device_id = $2
       RETURNING *`,
      [alertId, deviceId]
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '삭제할 알림 설정을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '알림 설정이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('알림 설정 삭제 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 설정 삭제에 실패했습니다.'
    });
  }
});

// 알림 로그 관련 라우트들
router.get('/:deviceId/logs', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50 } = req.query;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    const logs = await Database.query(
      `SELECT id, sensor_type, sensor_name, value_index, condition_type, sensor_value, threshold_value, message, created_at
       FROM alert_logs 
       WHERE device_id = $1
       ORDER BY created_at DESC 
       LIMIT $2`,
      [deviceId, parseInt(limit)]
    );

    res.json({
      success: true,
      data: logs,
      deviceId: deviceId
    });

  } catch (error) {
    console.error('알림 로그 조회 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 로그를 불러올 수 없습니다.'
    });
  }
});

// 모든 로그 삭제
router.delete('/:deviceId/logs/all', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    const result = await Database.query(
      `DELETE FROM alert_logs 
       WHERE device_id = $1`,
      [deviceId]
    );

    res.json({
      success: true,
      message: `모든 알림 로그가 삭제되었습니다.`,
      deletedCount: result.rowCount || 0
    });

  } catch (error) {
    console.error('모든 알림 로그 삭제 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 로그 삭제에 실패했습니다.'
    });
  }
});

// 개별 로그 삭제
router.delete('/:deviceId/logs/:logId', authenticateToken, async (req, res) => {
  try {
    const { deviceId, logId } = req.params;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    const result = await Database.query(
      `DELETE FROM alert_logs 
       WHERE id = $1 AND device_id = $2
       RETURNING *`,
      [logId, deviceId]
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: '삭제할 알림 로그를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      message: '알림 로그가 삭제되었습니다.'
    });

  } catch (error) {
    console.error('알림 로그 삭제 오류:', error);
    res.status(error.message.includes('권한') ? 403 : 500).json({
      success: false,
      message: error.message || '알림 로그 삭제에 실패했습니다.'
    });
  }
});

// 카카오 테스트
router.post('/:deviceId/test-kakao', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { testPhone, alertType = 'alert', sensorType = 'temperature', sensorName } = req.body;
    const userId = req.user.id;

    await checkDeviceAccess(userId, deviceId);

    let targetPhone = testPhone;
    let deviceName = 'TEST_DEVICE';
    let deviceLocation = '위치 정보 없음';

    if (!targetPhone) {
      const deviceOwner = await Database.query(
        `SELECT u.name, u.phone, d.device_name, d.device_location
         FROM devices d 
         JOIN users u ON d.registered_by = u.id 
         WHERE d.device_id = $1`,
        [deviceId]
      );

      if (deviceOwner.length === 0 || !deviceOwner[0].phone) {
        return res.status(400).json({
          success: false,
          message: '테스트 번호를 입력하거나 사용자 계정에 전화번호를 등록해주세요'
        });
      }

      targetPhone = deviceOwner[0].phone;
      deviceName = deviceOwner[0].device_name;
      deviceLocation = deviceOwner[0].device_location || '위치 정보 없음';
    }

    const testValues = {
      'temperature': { current: 25.5, threshold: 25.0, unit: '°C' },
      'humidity': { current: 85.2, threshold: 80.0, unit: '%' },
      'pressure': { current: 22.3, threshold: 20.0, unit: '°C' },
      'lightLevel': { current: 15000, threshold: 12000, unit: 'lux' },
      'motionLevel': { current: 2.5, threshold: 2.0, unit: 'dS/m' },
      'gasLevel': { current: 5.5, threshold: 6.0, unit: '' }
    };

    const testData = testValues[sensorType] || testValues['temperature'];

    const testAlertData = {
      sensorType: sensorType,
      sensorName: sensorName,
      conditionType: sensorType === 'gasLevel' ? 'below' : 'above',
      currentValue: testData.current,
      thresholdValue: testData.threshold,
      timestamp: new Date().toLocaleString('ko-KR'),
      deviceName: deviceName,
      deviceLocation: deviceLocation
    };

    const success = await sendKakaoAlertToPhone(targetPhone, alertType, testAlertData);

    res.json({
      success: success,
      message: success
        ? `테스트 알림톡이 ${targetPhone}로 발송되었습니다.`
        : '알림톡 발송에 실패했습니다.',
      testData: {
        phone: targetPhone,
        alertType: alertType,
        sensorType: sensorType,
        sensorName: sensorName,
        ...testAlertData
      }
    });

  } catch (error) {
    console.error('카카오 알림톡 테스트 오류:', error);
    res.status(500).json({
      success: false,
      message: '테스트 발송에 실패했습니다: ' + error.message
    });
  }
});
// 🔥 디바이스 소유자의 모든 수신 번호(메인 + 서브 인증번호들) 가져오기
async function getOwnerPhonesAndDeviceInfo(deviceId) {
  // 1) 디바이스 정보 + 소유자 기본 정보
  const ownerRows = await Database.query(
    `SELECT u.id AS user_id, u.name, u.phone AS primary_phone,
            d.device_name, d.device_location
       FROM devices d
       JOIN users u ON d.registered_by = u.id
      WHERE d.device_id = $1`,
    [deviceId]
  );

  if (ownerRows.length === 0) {
    return { owner: null, device: null, phones: [] };
  }

  const owner = ownerRows[0];

  // 2) 소유자의 서브 전화번호(인증된 것만)
  const subRows = await Database.query(
    `SELECT phone
       FROM user_phones
      WHERE user_id = $1
        AND is_verified = true
      ORDER BY is_primary DESC, created_at ASC`,
    [owner.user_id]
  );

  // 3) 번호 합치고 중복 제거(하이픈 제거 후)
  const phonesSet = new Set();

  const addPhone = (p) => {
    if (!p) return;
    const normalized = String(p).replace(/-/g, '').trim();
    if (normalized) phonesSet.add(normalized);
  };

  addPhone(owner.primary_phone);
  for (const r of subRows) addPhone(r.phone);

  return {
    owner: { id: owner.user_id, name: owner.name },
    device: {
      name: owner.device_name,
      location: owner.device_location || '위치 정보 없음'
    },
    phones: Array.from(phonesSet) // 문자열 배열
  };
}
// 🔥 지정된 번호로 알림톡 발송하는 함수
async function sendKakaoAlertToPhone(phoneNumber, alertType, alertData) {
  try {
    const enrichedAlertData = {
      ...alertData,
      deviceLocation: alertData.deviceLocation || '위치 정보 없음'
    };

    const template = generateAlertTemplate(alertType, enrichedAlertData);

    const kakaoData = [{
      message_type: 'at',
      phn: phoneNumber.replace(/-/g, ''),
      profile: KAKAO_CONFIG.profile,
      tmplId: template.tmplId,
      msg: template.message,
      smsKind: 'L',
      msgSms: template.message,
      smsSender: KAKAO_CONFIG.smsSender,
      smsLmsTit: template.title,
      reserveDt: '00000000000000'
    }];

    const response = await fetch(KAKAO_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'userid': KAKAO_CONFIG.userid
      },
      body: JSON.stringify(kakaoData)
    });

    const result = await response.json();

    if (response.ok && result[0]?.code === 'success') {
      return true;
    } else {
      console.error(`❌ 카카오 알림톡 테스트 발송 실패: ${phoneNumber}`, result);
      return false;
    }

  } catch (error) {
    console.error('카카오 알림톡 테스트 발송 오류:', error);
    return false;
  }
}

// 외부에서 사용할 수 있도록 export
router.checkAlerts = checkAlerts;

module.exports = router;