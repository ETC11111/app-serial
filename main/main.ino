// main.ino
#include "Config.h"
// #include "i2cHandler.h"
#include "modbusHandler.h"
// nutCycle.h는 더 이상 필요 없음 (UNO에서 처리)

// Modbus 센서 발견 여부 확인 함수 (I2C 센서들은 Modbus로 통합됨)
bool isModbusSensorFound(uint8_t sensorType) {
    for (uint8_t i = 0; i < modbusSlaveCount; i++) {
        if (modbusSensors[i].type == sensorType && modbusSensors[i].active) {
            return true;
        }
    }
    return false;
}

// ADS1115 센서 발견 시 UNO 센서 요청 비활성화 알림 (Modbus 방식)
void checkADS1115Status() {
    static bool lastADS1115Status = false;
    bool currentADS1115Status = isModbusSensorFound(MODBUS_ADS1115);
    
    if (currentADS1115Status != lastADS1115Status) {
        if (currentADS1115Status) {
            Serial.println(F("🔍 ADS1115 센서 발견 - UNO 센서 요청 비활성화"));
        } else {
            Serial.println(F("🔍 ADS1115 센서 없음 - UNO 센서 요청 활성화"));
        }
        lastADS1115Status = currentADS1115Status;
    }
}


// 마지막 우노 센서 요청 시간
unsigned long lastUnoSensorRequest = 0;
// UNO 센서 요청은 5초마다 고정으로 처리됨


// UNO 제어 함수들 (modbusHandler.cpp에서 정의됨)


void setup()
{
    initSetup();
    delay(10);
    // nutCycle 초기화는 이제 UNO에서 수행
    initUnoSensorRequest(); // UNO 센서 요청 시스템 초기화
    initUnoStatusRequest(); // UNO 상태 요청 시스템 초기화
    initSerial3Manager(); // Serial3 통신 관리자 초기화
    // RS485 제어 채널(Serial3) 초기화 - 상태머신에서 Modbus 초기화를 스킵하므로 여기서 초기화
    pinMode(RS485_CONTROL_DE_RE_PIN, OUTPUT);
    digitalWrite(RS485_CONTROL_DE_RE_PIN, LOW); // 수신 기본
    RS485_CONTROL_SERIAL.begin(RS485_CONTROL);
    delay(50);
    // 센서 UNO 외부 트리거 입력 핀 (D38~D43)
    // pinMode(38, INPUT_PULLUP);
    // pinMode(39, INPUT_PULLUP);
    // pinMode(40, INPUT_PULLUP);
    // pinMode(41, INPUT_PULLUP);
    // pinMode(42, INPUT_PULLUP);
    // pinMode(43, INPUT_PULLUP);
    
    delay(100);
}

void loop()
{
    unsigned long currentTime = millis();

    // 네트워크 상태 모니터링 (모든 상태에서 실행)
    checkNetworkStatus();
    
    // 부팅 타임아웃 체크 (모든 상태에서 실행)
    checkBootTimeout();
    
    // 네오픽셀 상태 업데이트 (모든 상태에서 실행)
    updateNeoPixelStatus();
    
    // 부저 상태 업데이트 (모든 상태에서 실행)
    updateBuzzerStatus();
    
    switch (currentState)
    {
    case STATE_DEVICE_REGISTRATION:
        handleDeviceRegistration();
        if (httpActive)
            handleWeb();
        break;
    case STATE_I2C_SENSOR_INIT:
        // I2C 센서는 UNO에서 Modbus RTU로 통합 처리하므로, Modbus 초기화 단계로 이동
        Serial.println(F("🔁 I2C 센서 통합 적용 - Modbus 초기화 단계로 이동"));
        currentState = STATE_MODBUS_INIT;
        stateChangeTime = millis();
        break;
    case STATE_MODBUS_INIT:
        // Modbus 초기화 수행 (스킵 제거)
        handleModbusInitialization();
        break;
    case STATE_MQTT_INIT:
        handleMQTTInitialization();
        break;
    case STATE_NORMAL_OPERATION:
        handleNormalOperation();
        break;
    case STATE_NETWORK_RECOVERY:
        handleNetworkRecovery();
        break;
    }
    
    // DHCP 유지 (모든 상태에서 실행)
    maintainDHCP();
}

void handleMQTTInitialization()
{
    // 네트워크 연결 상태 확인 - 연결되지 않으면 복구 모드로 전환
    if (!isNetworkConnected()) {
        static unsigned long lastNetworkWarning = 0;
        unsigned long currentTime = millis();
        
        // 10초마다 네트워크 연결 필요 메시지 출력
        if (currentTime - lastNetworkWarning >= 10000) {
            Serial.println(F("⚠ MQTT 초기화 중 네트워크 연결 끊어짐 - 복구 대기"));
            lastNetworkWarning = currentTime;
        }
        
        // 네트워크 복구 모드로 전환
        if (currentState != STATE_NETWORK_RECOVERY) {
            currentState = STATE_NETWORK_RECOVERY;
            networkRecoveryStartTime = currentTime;
            Serial.println(F("🔄 네트워크 복구 대기 모드로 전환"));
        }
        return;
    }
    
    if (millis() - stateChangeTime > STATE_DELAY)
    {
        Serial.println(F("MQTT 연결 시도..."));
        if (connectMQTT())
        {
            currentState = STATE_NORMAL_OPERATION;
            stateChangeTime = millis();
            Serial.println(F("시스템 준비 완료"));
            
            // 정상 시작 시 부팅 타임아웃 비활성화
            bootTime = 0; // 부팅 타임아웃 비활성화
            Serial.println(F("✅ 부팅 타임아웃 안전장치 비활성화"));
        }
        else
        {
            lastMQTTAttempt = millis();
        }
    }

    if (millis() - lastMQTTAttempt > MQTT_RETRY)
    {
        lastMQTTAttempt = millis();
        connectMQTT();
    }
}

void handleNormalOperation()
{
    unsigned long currentTime = millis();
    // D38~D43은 UNO ID 할당 후 INPUT(Hi-Z) 상태로 변경되므로 모니터링 불필요

    // 네트워크 연결 상태 확인 및 복구 감지
    static bool lastNetworkState = true;
    bool currentNetworkState = isNetworkConnected();
    
    if (!currentNetworkState) {
        // 네트워크 연결 끊어짐
        if (lastNetworkState) {
            Serial.println(F("⚠ 정상 운영 중 네트워크 연결 끊어짐 감지"));
            currentState = STATE_NETWORK_RECOVERY;
            networkRecoveryStartTime = currentTime;
            mqttConnected = false;
        }
        lastNetworkState = false;
        return;
    } else {
        // 네트워크 연결 복구됨 (이전에 끊어졌다가 복구된 경우)
        if (!lastNetworkState) {
            Serial.println(F("✅ 정상 운영 중 네트워크 연결 복구됨 - 시스템 재초기화"));
            currentState = STATE_DEVICE_REGISTRATION;
            stateChangeTime = currentTime;
            networkRecoveryStartTime = 0;
            mqttConnected = false;
            isRegistered = false;
            registrationAttempted = false;
            lastNetworkState = true;
            return;
        }
        lastNetworkState = true;
    }

    if (!mqttClient.connected())
    {
        mqttConnected = false;
        
        // MQTT 연결 실패 시간 추적
        if (mqttFailureStartTime == 0) {
            mqttFailureStartTime = currentTime;
            Serial.println(F("⚠ MQTT 연결 실패 감지 - 실패 시간 추적 시작"));
        }
        
        // MQTT 연결 실패가 일정 시간 이상 지속되면 상태머신 초기화
        if (currentTime - mqttFailureStartTime >= MQTT_FAILURE_TIMEOUT) {
            Serial.println(F("⚠ MQTT 연결 실패 지속 (60초) - 상태머신 초기화"));
            Serial.println(F("🔄 네트워크 복구 모드로 전환하여 재초기화"));
            currentState = STATE_NETWORK_RECOVERY;
            networkRecoveryStartTime = currentTime;
            mqttFailureStartTime = 0;  // 리셋
            mqttConnected = false;
            isRegistered = false;
            registrationAttempted = false;
            return;
        }
        
        if (currentTime - lastMQTTAttempt > MQTT_RETRY)
        {
            lastMQTTAttempt = currentTime;
            bool success = connectMQTT();
            
            // 연결 성공 시 실패 시간 리셋
            if (success) {
                mqttFailureStartTime = 0;
            }
        }
    }
    else
    {
        // MQTT 연결 성공 시 실패 시간 리셋
        if (mqttFailureStartTime != 0) {
            mqttFailureStartTime = 0;
            Serial.println(F("✅ MQTT 연결 복구됨"));
        }
        mqttClient.loop();
    }

    // UNO 센서 요청 (5초마다, nutCycle 상태 무시)
    // ADS1115 센서가 발견되면 UNO 센서 요청 비활성화
    if (!isModbusSensorFound(MODBUS_ADS1115) && currentTime - lastUnoSensorRequest > 5000) {
        lastUnoSensorRequest = currentTime;
        startUnoSensorRequest();
    }
    
    // 우노 센서 응답 처리 (Non-blocking)
    updateUnoSensorRequest();
    // 우노 상태 응답 처리 (Non-blocking)
    updateUnoStatusRequest();
    // 제어용 UNO 존재 감지 (IDLE시에만 비간섭 읽기)
    pollUnoControlHandshake();
    // 센서용 UNO(Serial1) 푸시 프레임 수집 (등록/스캔 없이)
    pollUnoPushFrames();
    
    // UNO 상태 요청 (30초마다, nutCycle 상태 전송용)
    static unsigned long lastUnoStatusRequest = 0;
    if (unoControlPresent && currentTime - lastUnoStatusRequest > 30000) {
        lastUnoStatusRequest = currentTime;
        startUnoStatusRequest();
    }

    // 센서 상태 모니터링 (UNO가 모든 센서를 담당하므로 주석처리)
    // static unsigned long lastSensorHealthCheck = 0;
    // if (currentTime - lastSensorHealthCheck >= 10000) {
    //     lastSensorHealthCheck = currentTime;
    //     checkSensorHealth();
    // }

    // 센서 헬스체크 (UNO가 모든 센서를 담당하므로 주석처리)
    // static unsigned long lastHealthCheck = 0;
    // if (currentTime - lastHealthCheck >= 15000) {
    //     lastHealthCheck = currentTime;
    //     performHealthCheck();
    // }

    if (currentTime - lastSensorRead > SENSOR_INTERVAL)
    {
        lastSensorRead = currentTime;

        if (modbusSensorsReady) // I2C 센서는 Modbus로 통합됨
        {
            // UNO 센서 요청이 진행 중이면 완료 대기
            if (unoRequestState != UNO_IDLE) {
                unsigned long waitStart = millis();
                while (unoRequestState != UNO_IDLE && (millis() - waitStart) < 5000) {
                    updateUnoSensorRequest();
                    delay(10);
                }
                if (unoRequestState != UNO_IDLE) {
                    unoRequestState = UNO_IDLE;
                    serial3Owner = SERIAL3_IDLE;
                }
            }
            
            sendUnifiedSensorData();
            // 30초마다 버킷 리셋하여 탈착/변화 반영
            resetUnoBucketsIfExpired();
        }
    }

    handleWeb();

    // updateUnoSensorData();
    // nutCycle 처리는 이제 UNO에서 자체적으로 수행
    // Mega는 설정 전달만 담당
    
    // ADS1115 센서 상태 체크
    checkADS1115Status();
}

// UNO 제어 명령 큐 처리 (modbusHandler.cpp에서 정의됨)

void sendUnifiedSensorData()
{
    if (!mqttConnected)
        return;

    uint8_t payload[512];  // 🔥 버퍼 크기 증가 (256 → 512)
    uint16_t payloadSize = 0;
    uint8_t currentSensorId = 0;  // 🔥 순차적 센서 ID 할당

    // 🔥 채널 카운터 초기화 (동종 센서에 대해 채널 번호 순차 할당)
    // 인덱스: 0=SHT20, 1=조도, 2=ADS1115, 3=SCD41, 4=DS18B20
    // 인덱스: 5=MODBUS_SHT20, 6=MODBUS_SCD41, 7=MODBUS_TSL2591, 8=MODBUS_BH1750, 9=MODBUS_ADS1115, 10=MODBUS_DS18B20
    uint8_t globalChannelCounters[11] = {0}; // 11개 타입 지원 (0~10)

    // 🔥 실제 활성 센서 개수 계산
    uint8_t activeSensors = 0;
    for (uint8_t i = 0; i < modbusSlaveCount; i++) {
        if (modbusSensors[i].active) activeSensors++;
    }
    // 제어용 UNO(Serial3)의 ADS1115 데이터를 사용할 경우만 +1
    if (!isModbusSensorFound(MODBUS_ADS1115) && unoSensorData.isValid) {
        activeSensors += 1;
    }
    

    // 센서 개수 계산 완료

    // Header (8 bytes)
    payload[payloadSize++] = 0x01;
    payload[payloadSize++] = 0x03;
    payload[payloadSize++] = (uint8_t)(millis() >> 24);
    payload[payloadSize++] = (uint8_t)(millis() >> 16);
    payload[payloadSize++] = (uint8_t)(millis() >> 8);
    payload[payloadSize++] = (uint8_t)(millis());
    payload[payloadSize++] = activeSensors;  // 🔥 실제 활성 센서 개수
    payload[payloadSize++] = 0x00;

    // I2C 규격과 동일 포맷으로 각 타입 인코딩
    for (uint8_t i = 0; i < modbusSlaveCount; i++) {
        if (!modbusSensors[i].active) continue;

        payload[payloadSize++] = currentSensorId++;
        // 백엔드 호환 매핑: MODBUS_* (21~26) → 기존 I2C/디지털 타입
        uint8_t mappedType = modbusSensors[i].type;
        if (mappedType == MODBUS_SHT20)      mappedType = 1; // SHT20
        else if (mappedType == MODBUS_SCD41) mappedType = 4; // CO2 (SCD30 호환 타입 사용)
        else if (mappedType == MODBUS_TSL2591) mappedType = 2; // 조도는 통합 타입(2)
        else if (mappedType == MODBUS_BH1750)  mappedType = 2; // BH1750
        else if (mappedType == MODBUS_ADS1115) mappedType = 3; // ADS1115
        else if (mappedType == MODBUS_DS18B20) mappedType = 5; // DS18B20
        payload[payloadSize++] = mappedType;
        payload[payloadSize++] = modbusSensors[i].slaveId;
        
        // 🔥 Combined ID에서 UNO_ID 추출하여 CH로 사용
        // Combined ID: 하위 5비트=타입코드, 상위 3비트=UNO_ID (1~6)
        uint8_t typeCode = 0;
        uint8_t unoId = 0;
        splitCombinedId(modbusSensors[i].slaveId, &typeCode, &unoId);
        
        // UNO_ID가 0이면 순차 할당 (레거시 호환)
        uint8_t ch = unoId;
        if (ch == 0) {
            // UNO_ID가 없는 경우 순차 할당 (호환성)
            uint8_t counterIdx = 255;
            switch (mappedType) {
                case 1: counterIdx = 0; break; // SHT20
                case 2: counterIdx = 1; break; // 조도
                case 3: counterIdx = 2; break; // ADS1115
                case 4: counterIdx = 3; break; // SCD41
                case 5: counterIdx = 4; break; // DS18B20
                default: break;
            }
            if (counterIdx < sizeof(globalChannelCounters)) {
                globalChannelCounters[counterIdx]++;
                ch = globalChannelCounters[counterIdx];
            }
        }
        payload[payloadSize++] = ch;

        switch (modbusSensors[i].type)
        {
        case MODBUS_SCD41: {
            uint16_t co2_int = modbusSensors[i].registers[0];
            payload[payloadSize++] = co2_int >> 8;
            payload[payloadSize++] = co2_int & 0xFF;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        case MODBUS_SHT20: {
            uint16_t temp_int = modbusSensors[i].registers[0]; // ×100
            uint16_t humid_int = modbusSensors[i].registers[1]; // ×100
            payload[payloadSize++] = temp_int >> 8;
            payload[payloadSize++] = temp_int & 0xFF;
            payload[payloadSize++] = humid_int >> 8;
            payload[payloadSize++] = humid_int & 0xFF;
            break;
        }
        case MODBUS_TSL2591: {
            uint16_t lux_int = modbusSensors[i].registers[0]; // ×10
            payload[payloadSize++] = lux_int >> 8;
            payload[payloadSize++] = lux_int & 0xFF;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        case MODBUS_BH1750: {
            uint16_t lux_int = modbusSensors[i].registers[0]; // ×10
            payload[payloadSize++] = lux_int >> 8;
            payload[payloadSize++] = lux_int & 0xFF;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        case MODBUS_DS18B20: {
            uint16_t t_int = modbusSensors[i].registers[0]; // ×100
            payload[payloadSize++] = t_int >> 8;
            payload[payloadSize++] = t_int & 0xFF;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        case MODBUS_SOIL_SENSOR: { // MODBUS_SOIL_SENSOR = 19 (토양센서 - 8개 레지스터)
            // ✅ UNO 전송: r0=습도, r1=온도, r2=EC, r3=pH, r4=N, r5=P, r6=K, r7=상태
            // ✅ 4개 값 모두 전송: 습도, 온도, EC, pH
            uint16_t soilHumi = modbusSensors[i].registers[0];  // 습도
            uint16_t soilTemp = modbusSensors[i].registers[1];  // 온도
            uint16_t soilEC = modbusSensors[i].registers[2];    // EC
            uint16_t soilPH = modbusSensors[i].registers[3];    // pH
            payload[payloadSize++] = soilHumi >> 8;
            payload[payloadSize++] = soilHumi & 0xFF;
            payload[payloadSize++] = soilTemp >> 8;
            payload[payloadSize++] = soilTemp & 0xFF;
            payload[payloadSize++] = soilEC >> 8;   // EC 상위 바이트
            payload[payloadSize++] = soilEC & 0xFF; // EC 하위 바이트
            payload[payloadSize++] = soilPH >> 8;   // pH 상위 바이트
            payload[payloadSize++] = soilPH & 0xFF; // pH 하위 바이트
            // ✅ 토양센서는 이미 8바이트를 전송했으므로 reserved 필드 추가하지 않음
            goto skip_reserved; // reserved 필드 추가 건너뛰기
        }
        case 16: { // MODBUS_WIND_DIRECTION (풍향 센서)
            uint16_t gear = modbusSensors[i].registers[0];  // 기어값 (0~7)
            uint16_t degree = modbusSensors[i].registers[1]; // 각도 (0~360)
            payload[payloadSize++] = gear >> 8;
            payload[payloadSize++] = gear & 0xFF;
            payload[payloadSize++] = degree >> 8;
            payload[payloadSize++] = degree & 0xFF;
            break;
        }
        case 17: { // MODBUS_WIND_SPEED (풍속 센서)
            uint16_t speed = modbusSensors[i].registers[0];  // 풍속 (×10)
            payload[payloadSize++] = speed >> 8;
            payload[payloadSize++] = speed & 0xFF;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        case 18: { // MODBUS_RAIN_SNOW (강우/강설 센서 - 10개 레지스터)
            // UNO 전송: r0=강우, r1=강설, r2=예약, r3=온도, r4=습도, r5~r9=수분레벨 1~5
            // 백엔드 형식: value1 = (강수상태 4비트 << 12) | (수분레벨 12비트)
            //             value2 = (온도바이트 8비트 << 8) | (습도 8비트)
            
            uint16_t rainfall = modbusSensors[i].registers[0];
            uint16_t snowfall = modbusSensors[i].registers[1];
            uint16_t temperature = modbusSensors[i].registers[3];  // 온도 (×10 스케일 또는 원시값)
            uint16_t humidity = modbusSensors[i].registers[4];     // 습도 (0-100% 또는 ×10 스케일)
            
            // 강수 상태 판단: rainfall > 0이면 강우(1), snowfall > 0이면 강설(2), 둘 다 0이면 건조(0)
            uint8_t precipStatus = 0;
            if (snowfall > 0) {
                precipStatus = 2;  // 강설
            } else if (rainfall > 0) {
                precipStatus = 1;  // 강우
            } else {
                precipStatus = 0;  // 건조
            }
            
            // 수분 레벨 계산: r5~r9의 평균 또는 합계 사용 (0-4095 범위)
            uint32_t moistureSum = 0;
            uint8_t moistureCount = 0;
            for (int j = 5; j <= 9 && j < 10; j++) {
                moistureSum += modbusSensors[i].registers[j];
                moistureCount++;
            }
            uint16_t moistureLevel = (moistureCount > 0) ? (moistureSum / moistureCount) : 0;
            if (moistureLevel > 4095) moistureLevel = 4095;  // 12비트 최대값 제한
            
            // value1 인코딩: 상위 4비트 = 강수 상태, 하위 12비트 = 수분 레벨
            uint16_t value1 = ((precipStatus & 0x0F) << 12) | (moistureLevel & 0x0FFF);
            
            // 온도 변환: 온도가 ×10 스케일로 전송됨 (예: 25.0°C = 250)
            // 백엔드는 tempByte - 40 형식이므로, 온도를 0~255 범위로 변환 (실제 온도 + 40)
            // 온도 범위: -40°C ~ 215°C → 0 ~ 255 바이트
            int16_t tempC = (int16_t)temperature;
            // ×10 스케일로 전송되므로 나누기 10 (예: 250 → 25.0°C)
            tempC = tempC / 10;
            // 범위 제한: -40°C ~ 215°C
            if (tempC < -40) tempC = -40;
            if (tempC > 215) tempC = 215;
            uint8_t tempByte = (uint8_t)(tempC + 40);  // -40~215 → 0~255
            
            // 습도 변환: 0-100% 범위로 정규화
            uint8_t humidityByte = (uint8_t)humidity;
            if (humidityByte > 100) {
                if (humidityByte > 1000) humidityByte = humidityByte / 10;  // ×10 스케일이면 나누기
                else humidityByte = 100;  // 최대 100%로 제한
            }
            
            // value2 인코딩: 상위 8비트 = 온도 바이트, 하위 8비트 = 습도
            uint16_t value2 = ((uint16_t)tempByte << 8) | humidityByte;
            
            // 백엔드 형식으로 전송
            payload[payloadSize++] = value1 >> 8;
            payload[payloadSize++] = value1 & 0xFF;
            payload[payloadSize++] = value2 >> 8;
            payload[payloadSize++] = value2 & 0xFF;
            break;
        }
        default: {
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
            break;
        }
        }

        skip_reserved:
        // ✅ 토양센서는 이미 reserved 필드를 포함하여 전송했으므로 추가하지 않음
        if (modbusSensors[i].type != MODBUS_SOIL_SENSOR) {
            payload[payloadSize++] = 0x00;
            payload[payloadSize++] = 0x00;
        }
    }

    // 우노 센서 데이터 추가 (제어용 UNO의 ADS1115 경로)
    if (!isModbusSensorFound(MODBUS_ADS1115) && unoSensorData.isValid) {
        // UNO 센서 처리
        payload[payloadSize++] = currentSensorId++;  // 🔥 순차적 ID 할당
        payload[payloadSize++] = 3; // 우노 센서 타입 (SENSOR_ADS1115 = 3)
        payload[payloadSize++] = 0; // 채널 번호
        payload[payloadSize++] = 0x01; // 활성상태

        // pH, EC, 수온 데이터 인코딩
        uint16_t ph_int = (uint16_t)constrain(unoSensorData.ph * 100, 0, 1400);
        uint16_t ec_int = (uint16_t)constrain(unoSensorData.ec * 100, 0, 65535);  // dS/m × 100
        uint16_t water_temp_int = (uint16_t)constrain(unoSensorData.waterTemp * 100, 0, 10000);

        payload[payloadSize++] = ph_int >> 8;
        payload[payloadSize++] = ph_int & 0xFF;
        payload[payloadSize++] = ec_int >> 8;
        payload[payloadSize++] = ec_int & 0xFF;

        // 수온 데이터 추가 (reserved1, reserved2에 저장)
        payload[payloadSize++] = water_temp_int >> 8;
        payload[payloadSize++] = water_temp_int & 0xFF;

         // UNO 센서 데이터 처리 완료
    }

    // Modbus 센서 데이터 (활성 센서만 처리)
    // 호환을 위해 원시 타입 기준으로도 CH를 순차 할당
    // 인덱스: 5=MODBUS_SHT20, 6=MODBUS_SCD41, 7=MODBUS_TSL2591, 8=MODBUS_BH1750, 9=MODBUS_ADS1115, 10=MODBUS_DS18B20
    // ✅ 토양센서는 위의 switch-case에서 이미 처리되므로 여기서는 제외
    for (uint8_t i = 0; i < modbusSlaveCount; i++)
    {
        if (!modbusSensors[i].active)
            continue;
        
        // ✅ 토양센서는 위의 switch-case에서 이미 처리되었으므로 제외
        if (modbusSensors[i].type == MODBUS_SOIL_SENSOR)
            continue;

        // Modbus 센서 처리

        payload[payloadSize++] = currentSensorId++;  // 🔥 순차적 ID 할당
        payload[payloadSize++] = modbusSensors[i].type;
        payload[payloadSize++] = modbusSensors[i].slaveId;
        
        // 🔥 Combined ID에서 UNO_ID 추출하여 CH로 사용
        // Combined ID: 하위 5비트=타입코드, 상위 3비트=UNO_ID (1~6)
        uint8_t typeCodeRaw = 0;
        uint8_t unoIdRaw = 0;
        splitCombinedId(modbusSensors[i].slaveId, &typeCodeRaw, &unoIdRaw);
        
        // UNO_ID가 0이면 순차 할당 (레거시 호환)
        uint8_t chRaw = unoIdRaw;
        if (chRaw == 0) {
            // UNO_ID가 없는 경우 순차 할당 (호환성)
            uint8_t counterIdx = 255;
            switch (modbusSensors[i].type) {
                case MODBUS_SHT20:    counterIdx = 5; break;
                case MODBUS_SCD41:    counterIdx = 6; break;
                case MODBUS_TSL2591:  counterIdx = 7; break;
                case MODBUS_BH1750:   counterIdx = 8; break;
                case MODBUS_ADS1115:  counterIdx = 9; break;
                case MODBUS_DS18B20:  counterIdx = 10; break;
                default: break;
            }
            if (counterIdx < sizeof(globalChannelCounters)) {
                globalChannelCounters[counterIdx]++;
                chRaw = globalChannelCounters[counterIdx];
            }
        }
        payload[payloadSize++] = chRaw;

        // UNO가 모든 센서 읽기를 담당하므로 registers에서 직접 사용
        // UNO로부터 받은 Modbus RTU 데이터는 modbusSensors[i].registers[]에 저장되어 있음
        uint16_t value1 = modbusSensors[i].registers[0];
        uint16_t value2 = modbusSensors[i].registers[1];
        
        payload[payloadSize++] = value1 >> 8;
        payload[payloadSize++] = value1 & 0xFF;
        payload[payloadSize++] = value2 >> 8;
        payload[payloadSize++] = value2 & 0xFF;
        payload[payloadSize++] = 0x00;
        payload[payloadSize++] = 0x00;
        payload[payloadSize++] = 0x00;
        payload[payloadSize++] = 0x00;
    }



    // 🔥 최종 검증
    uint8_t actualProcessedSensors = currentSensorId;
    // 센서 수 검증 완료

    // CRC 계산
    // uint16_t crc = calcCRC16(payload, payloadSize);
    // payload[payloadSize++] = crc & 0xFF;
    // payload[payloadSize++] = crc >> 8;

    // 바이너리 전송
    String unifiedTopic = "sensors/modbus/";
    unifiedTopic += DEVICE_ID;
    
    // 페이로드 전송 준비 완료
    
    bool publishResult = mqttClient.publish(unifiedTopic.c_str(), payload, payloadSize);
    
    if (publishResult) {
        // 센서 데이터 전송 완료
    } else {
        Serial.println(F("❌ 센서 데이터 전송 실패"));
    }

    // 센서 데이터 전송 완료
}






bool connectMQTT()
{
    if (mqttClient.connected())
        return true;

    Serial.print(F("Trying MQTT Connect... "));

    String clientId = String(DEVICE_ID) + "_" + String(millis());
    mqttClient.setServer(serverHost, mqttPort);
    mqttClient.setCallback(mqttCallback);

    if (mqttClient.connect(clientId.c_str()))
    {
        Serial.println(F("✅ Success"));

        // Modbus 명령 토픽 구독
        String commandTopic = "modbus/commands/";
        commandTopic += DEVICE_ID;
        mqttClient.subscribe(commandTopic.c_str());
        Serial.print(F("subscribe: "));
        Serial.println(commandTopic);

        // 양액 사이클 명령 토픽 구독
        String nutCommandTopic = "nutrient/commands/";
        nutCommandTopic += DEVICE_ID;
        mqttClient.subscribe(nutCommandTopic.c_str());
        Serial.print(F("subscribe: "));
        Serial.println(nutCommandTopic);

        mqttConnected = true;
        return true;
    }
    else
    {
        Serial.print(F("❌ Failed, rc="));
        Serial.println(mqttClient.state());
        mqttConnected = false;
        return false;
    }
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
    char jsonBuffer[512];
    if (length >= sizeof(jsonBuffer))
        length = sizeof(jsonBuffer) - 1;

    memcpy(jsonBuffer, payload, length);
    jsonBuffer[length] = '\0';

    Serial.print(F("📥 MQTT 수신: "));
    Serial.println(jsonBuffer);

    // Modbus 명령 처리 (문자열 할당 없이 비교)
    if (strncmp(topic, "modbus/commands/", sizeof("modbus/commands/") - 1) == 0)
    {
        handleModbusCommand(jsonBuffer);
    }
    // 양액 사이클 명령 처리 - UNO로 전달
    else if (strncmp(topic, "nutrient/commands/", sizeof("nutrient/commands/") - 1) == 0)
    {
        // UNO로 JSON 설정 전달
        sendNutrientConfigToUno(jsonBuffer);
    }
    else
    {
        Serial.print(F("❓ 알 수 없는 토픽: "));
        Serial.println(topic);
    }
}

void handleModbusCommand(const char* jsonCStr)
{
    // v6와 동일: 고정 크기 파서(스택)로 힙 단편화 방지
    StaticJsonDocument<256> doc;
    if (jsonCStr == nullptr || jsonCStr[0] == '\0') {
        Serial.println(F("❌ JSON 파싱 오류: EmptyInput"));
        return;
    }
    DeserializationError error = deserializeJson(doc, jsonCStr);
    if (error)
    {
        Serial.print(F("❌ JSON 파싱 오류: "));
        Serial.println(error.c_str());
        return;
    }
    
    Serial.println(F("✅ JSON 파싱 성공"));

    uint8_t slaveId = doc["slave_id"];
    uint8_t functionCode = doc["function_code"];
    uint16_t address = doc["address"];
    uint16_t value = doc["value"] | 0;
    String commandId = doc["command_id"] | "";

    // 응답에 포함할 추가 정보 미리 저장 (doc.clear() 전에)
    bool hasNpnCommand = doc.containsKey("npn_command");
    String npnCommand = hasNpnCommand ? String((const char *)doc["npn_command"]) : "";
    uint8_t npnChannel = hasNpnCommand ? doc["channel"] | 0 : 0;

    bool success = false;
    String response = "";

    // NPN 모듈 제어 명령 처리
    if (doc.containsKey("npn_command"))
    {
        String npnCmd = doc["npn_command"];
        uint8_t channel = doc["channel"] | 0;
        Serial.print(F("🔌 NPN 명령: "));
        Serial.print(npnCmd);
        Serial.print(F(", 채널: "));
        Serial.println(channel);
        success = handleNPNCommand(npnCmd, channel, response);
    }
    // UNO 명령 처리 (kind 기반으로 통일)
    else if (doc.containsKey("kind") && String((const char *)doc["kind"]) == "UNO_MODULE")
    {
        String unoCmd = String((const char *)doc["command"]);
        int channel = doc["channel"] | -1;
        Serial.print(F("🤖 UNO 명령: "));
        Serial.print(unoCmd);
        if (channel >= 0) {
            Serial.print(F(", 채널: "));
            Serial.print(channel);
        }
        Serial.println();
        
        // command_id를 전역 변수에 저장 (sendUnoAckToServer에서 사용)
        extern String currentUnoCommandId;
        currentUnoCommandId = commandId;
        
        success = handleUNOCommand(unoCmd, channel, response);

        // UNO 명령은 sendUnoAckToServer()에서 ACK를 보내므로 여기서는 응답하지 않음
        // (중복 응답 방지)
        return;
    }
       // 🔥 다중 릴레이 명령 처리
       else if (doc.containsKey("kind") && String((const char *)doc["kind"]) == "MULTI_RELAY")
       {
           String action = String((const char *)doc["action"]);
           JsonArray channels = doc["channels"];
           
           Serial.print(F("🔥 다중 릴레이 명령: "));
           Serial.print(action);
           Serial.print(F(", 채널: ["));
           for (int i = 0; i < channels.size(); i++) {
               Serial.print(channels[i].as<int>());
               if (i < channels.size() - 1) Serial.print(F(", "));
           }
           Serial.println(F("]"));
           
           success = handleMultiRelayCommand(action, channels, response);
           return;
       }
       // 🔥 NPN 다중 제어 명령 처리
       else if (doc.containsKey("kind") && String((const char *)doc["kind"]) == "MULTI_NPN")
       {
           String action = String((const char *)doc["action"]);
           JsonArray channels = doc["channels"];
           uint16_t bitmask = doc["bitmask"] | 0;
           
           Serial.print(F("🔥 NPN 다중 제어: "));
           Serial.print(action);
           Serial.print(F(", 채널: ["));
           for (int i = 0; i < channels.size(); i++) {
               Serial.print(channels[i].as<int>());
               if (i < channels.size() - 1) Serial.print(F(", "));
           }
           Serial.print(F("], 비트마스크: 0x"));
           Serial.println(bitmask, HEX);
           
           if (action == "ON") {
               success = npnMultiChannelOn(bitmask);
               response = "NPN_MULTI_ON_" + String(channels.size()) + "_BITS";
           } else if (action == "OFF") {
               success = npnMultiChannelOff(bitmask);
               response = "NPN_MULTI_OFF_" + String(channels.size()) + "_BITS";
           } else {
               success = false;
               response = "Invalid NPN action: " + action;
           }
           return;
       }
    // 새로운 백엔드 형식 처리 (kind + command)
    else if (doc.containsKey("kind") && doc.containsKey("command"))
    {
        Serial.print(F("🔥 새로운 백엔드 형식 처리: "));
        String kind = doc["kind"];
        String command = doc["command"];
        uint8_t channel = doc["channel"] | 0;
        success = handleKindCommand(kind, command, channel, response);
    }
    // Modbus 센싱 명령 처리
    else
    {
        switch (functionCode)
        {
        case 3:
        {
            // Mega는 더 이상 직접 Modbus를 읽지 않음. UNO가 담당.
            success = false;
            response = "Unsupported on Mega. Use UNO pathway.";
            break;
        }

        default:
            response = "Unsupported function code: " + String(functionCode);
            break;
        }
    }
    // MQTT 응답 전송 (기존 doc 재사용하여 메모리 절약)
    doc.clear();
    doc["command_id"] = commandId;
    doc["device_id"] = DEVICE_ID;
    doc["slave_id"] = slaveId;
    doc["function_code"] = functionCode;
    doc["address"] = address;
    doc["value"] = value;
    doc["success"] = success;
    doc["response"] = response;
    doc["timestamp"] = millis();
    doc["is_command_response"] = true;

    // npn_command 정보 추가 (미리 저장해둔 값 사용)
    if (hasNpnCommand)
    {
        doc["npn_command"] = npnCommand;
        doc["channel"] = npnChannel;
        doc["device_type"] = "NPN_MODULE";
    }

    String responseJson;
    serializeJson(doc, responseJson);

    String responseTopic = "modbus/command-responses/" + String(DEVICE_ID);
    mqttClient.publish(responseTopic.c_str(), responseJson.c_str());

    while (RS485_SENSING_SERIAL.available())
        RS485_SENSING_SERIAL.read();
}