#include "nutCycle.h"
#include <string.h>

// ============= 전역 변수 정의 =============
NutrientSettings nutrientSettings = {6.5, 1.2, 5.0, 10.0, 1.0, 4.0, 1, 1, 1, 1, 0, 0};
ScheduleSettings scheduleSettings = {6, 0, 18, 0, 0, 0, 0, 0};
MotorTimer motorTimer = {0, 0, 0, 0, 0, 0, 0, 0, 1};
CycleStaticVars cycleVars = {0};
IrrigationTimer irrigationTimer = {0};
CheckTimer phEcCheckTimer = {0};
NutSystemFlags nutSystemFlags = {0};
PulseFlags pulseFlags = {0};

int8_t cycle = -1;
CycleStatus cycleStatus = INACTIVE;
uint8_t currentHour = 0;
uint8_t currentMinute = 0;
uint8_t currentDay = 1;
uint8_t currentMonth = 1;
uint16_t currentYear = 2025;
uint32_t cycle_start_time = 0;
uint32_t ec_last_toggle = 0;
uint32_t ph_last_toggle = 0;
bool manualStartMode = false;

// ============= 헬퍼 함수들 =============
static inline bool isSkipPH() { return nutrientSettings.target_ph >= 99.0f; }
static inline bool isSkipEC() { return nutrientSettings.target_ec >= 99.0f; }
static inline bool skipAllMixing() { return isSkipPH() && isSkipEC(); }

// 릴레이 변경 추적 및 출력 헬퍼 함수 (메모리 최적화: String 제거)
// channels: 변경할 채널 배열, oldStates: 변경 전 상태 배열, newStates: 변경 후 상태 배열, count: 채널 개수
static void printRelayChanges(const __FlashStringHelper* prefix, uint8_t* channels, bool* oldStates, bool* newStates, uint8_t count) {
    // 메모리 절약을 위해 디버깅 출력 제거 (String 사용 제거)
    // 실제 핀 상태 확인만 수행 (자가복구를 위해)
    for (uint8_t i = 0; i < count; i++) {
        if (oldStates[i] != newStates[i]) {
            // 실제 핀 상태 확인 (자가복구를 위해)
            bool actualState = getRelayStatus(channels[i]);
            if (actualState != newStates[i]) {
                // 상태 불일치 시 재시도
                setRelay(channels[i], newStates[i]);
            }
        }
    }
}

// 펌프 상태 관리
static bool pumpStatus = false;
void setPumpStatus(bool status) {
    bool oldState = pumpStatus;
    pumpStatus = status;
    setRelay(UNO_CH_PUMP, status);
    
    // 펌프 자가복구 확인 (중요 릴레이)
    bool actualState = getRelayStatus(UNO_CH_PUMP);
    if (actualState != status) {
        // 자가복구 시도
        //Serial.print(F("Pump recovery: expected="));
        //Serial.print(status ? F("H") : F("L"));
        //Serial.print(F(" actual="));
        //Serial.print(actualState ? F("H") : F("L"));
        //Serial.print(F(" -> retrying..."));
        
        setRelay(UNO_CH_PUMP, status);
        delay(10); // 복구 대기
        actualState = getRelayStatus(UNO_CH_PUMP);
        
        if (actualState == status) {
            //Serial.println(F(" OK"));
        } else {
            //Serial.println(F(" FAILED"));
        }
    }
    
    if (oldState != status) {
        //Serial.print(F("Pump "));
        //Serial.print(status ? F("ON") : F("OFF"));
        //Serial.print(F(" actual: "));
        //Serial.println(actualState ? F("H") : F("L"));
    }
}

bool getPumpStatus() {
    return pumpStatus;
}

// ============= 초기화 함수 =============
void initNutrientCycle() {
    cycle = -1;
    cycleStatus = INACTIVE;
    nutSystemFlags.isCycle = false;
    nutSystemFlags.pumpRunning = false;
    nutSystemFlags.cycle_started_today = false;
    nutSystemFlags.timeReceived = false;
    nutSystemFlags.scheduleEndRequested = false;
    
    initIrrigationTimer();
    initPhEcCheckTimer();
    
    memset(&cycleVars, 0, sizeof(cycleVars));
    memset(&pulseFlags, 0, sizeof(pulseFlags));
    
    allPinsOff();
    //Serial.println(F("Nutrient cycle system initialized"));
}

// ============= JSON 명령 처리 =============
void processNutrientCommand(const char *jsonCommand) {
    StaticJsonDocument<160> doc;  // 192 → 160 (메모리 최적화)
    DeserializationError error = deserializeJson(doc, jsonCommand);
    
    if (error) {
        //Serial.print(F("JSON error: "));
        //Serial.println(error.f_str());
        return;
    }
    
    // TIME_SYNC는 로그 출력 생략 (메모리 최적화)
    
    // 명령어 확인 (나중에 처리하기 위해 저장)
    bool hasStartCommand = false;
    bool hasStopCommand = false;
    bool hasTimeSync = false;
    
    if (doc.containsKey("cmd")) {
        const char* command = doc["cmd"] | "";
        if (strcmp_P(command, PSTR("TIME_SYNC")) == 0 && doc.containsKey("time")) {
            hasTimeSync = true;
        } else if (strcmp_P(command, PSTR("START")) == 0) {
            hasStartCommand = true;
        } else if (strcmp_P(command, PSTR("STOP")) == 0) {
            hasStopCommand = true;
        }
    }
    
    // TIME_SYNC는 즉시 처리하고 리턴
    if (hasTimeSync) {
        const char* timeStr = doc["time"] | "";
        int y, m, d, h, mi, s;
        if (sscanf(timeStr, "%d-%d-%d %d:%d:%d", &y, &m, &d, &h, &mi, &s) == 6) {
            currentHour = h;
            currentMinute = mi;
            currentDay = d;
            currentMonth = m;
            currentYear = y;
            nutSystemFlags.timeReceived = true;
        }
        return;
    }
    
    // STOP 명령은 즉시 처리
    if (hasStopCommand) {
        stopECPulse();
        stopPHPulse();
        memset(&pulseFlags, 0, sizeof(pulseFlags));
        stopIrrigationTimer();
        stopPhEcCheckTimer();
        nutSystemFlags.isCycle = false;
        nutSystemFlags.pumpRunning = false;
        nutSystemFlags.cycle_started_today = false;
        nutSystemFlags.scheduleEndRequested = false;
        cycle = -1;
        cycleStatus = INACTIVE;
        manualStartMode = false;
        memset(&cycleVars, 0, sizeof(cycleVars));
        scheduleSettings.time_based_enabled = 0;
        scheduleSettings.once_based_enabled = 0;
        scheduleSettings.daily_based_enabled = 0;
        //Serial.println(F("STOP command"));
        allPinsOff();
        setPumpStatus(false);
        
        // STOP 명령 후 자가복구 확인 (중요 릴레이)
        delay(10); // 하드웨어 안정화
        bool recoveryNeeded = false;
        if (getRelayStatus(UNO_CH_PUMP) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_EC) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_EC2) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_PH) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_BED_A) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_BED_B) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_BED_C) != LOW) recoveryNeeded = true;
        if (getRelayStatus(UNO_CH_BED_D) != LOW) recoveryNeeded = true;
        
        if (recoveryNeeded) {
            //Serial.print(F("STOP recovery: "));
            if (getRelayStatus(UNO_CH_PUMP) != LOW) {
                //Serial.print(F("PUMP=H "));
                setRelay(UNO_CH_PUMP, LOW);
            }
            if (getRelayStatus(UNO_CH_EC) != LOW) {
                //Serial.print(F("EC=H "));
                setRelay(UNO_CH_EC, LOW);
            }
            if (getRelayStatus(UNO_CH_EC2) != LOW) {
                //Serial.print(F("EC2=H "));
                setRelay(UNO_CH_EC2, LOW);
            }
            if (getRelayStatus(UNO_CH_PH) != LOW) {
                //Serial.print(F("PH=H "));
                setRelay(UNO_CH_PH, LOW);
            }
            if (getRelayStatus(UNO_CH_BED_A) != LOW) {
                //Serial.print(F("BED_A=H "));
                setRelay(UNO_CH_BED_A, LOW);
            }
            if (getRelayStatus(UNO_CH_BED_B) != LOW) {
                //Serial.print(F("BED_B=H "));
                setRelay(UNO_CH_BED_B, LOW);
            }
            if (getRelayStatus(UNO_CH_BED_C) != LOW) {
                //Serial.print(F("BED_C=H "));
                setRelay(UNO_CH_BED_C, LOW);
            }
            if (getRelayStatus(UNO_CH_BED_D) != LOW) {
                //Serial.print(F("BED_D=H "));
                setRelay(UNO_CH_BED_D, LOW);
            }
            //Serial.print(F("-> retrying..."));
            delay(10);
            
            // 복구 확인
            bool allOK = (getRelayStatus(UNO_CH_PUMP) == LOW &&
                         getRelayStatus(UNO_CH_EC) == LOW &&
                         getRelayStatus(UNO_CH_EC2) == LOW &&
                         getRelayStatus(UNO_CH_PH) == LOW &&
                         getRelayStatus(UNO_CH_BED_A) == LOW &&
                         getRelayStatus(UNO_CH_BED_B) == LOW &&
                         getRelayStatus(UNO_CH_BED_C) == LOW &&
                         getRelayStatus(UNO_CH_BED_D) == LOW);
            //Serial.println(allOK ? F(" OK") : F(" FAILED"));
        }
        
        // 실제 핀 상태 확인
        //Serial.print(F("STOP actual: PUMP="));
        //Serial.print(getRelayStatus(UNO_CH_PUMP) ? F("H") : F("L"));
        //Serial.print(F(" EC="));
        //Serial.print(getRelayStatus(UNO_CH_EC) ? F("H") : F("L"));
        //Serial.print(F(" PH="));
        //Serial.print(getRelayStatus(UNO_CH_PH) ? F("H") : F("L"));
        //Serial.print(F(" BED="));
        //Serial.print(getRelayStatus(UNO_CH_BED_A) ? F("H") : F("L"));
        //Serial.print(getRelayStatus(UNO_CH_BED_B) ? F("H") : F("L"));
        //Serial.print(getRelayStatus(UNO_CH_BED_C) ? F("H") : F("L"));
        //Serial.println(getRelayStatus(UNO_CH_BED_D) ? F("H") : F("L"));
        //Serial.println(F("STOP complete"));
        return;
    }
    
    // 설정값 처리 (START 명령 전에 설정을 먼저 파싱)
    if (doc.containsKey("set")) {
        JsonObject settings = doc["set"];
        if (parseNutrientSettings(settings)) {
            motorInit(nutrientSettings.cycle_time);
            // 디버깅 출력
            //Serial.print(F("Settings: pH="));
            //Serial.print(nutrientSettings.target_ph);
            //Serial.print(F(", EC="));
            //Serial.print(nutrientSettings.target_ec);
            //Serial.print(F(", EP="));
            //Serial.print(nutrientSettings.error_ph);
            //Serial.print(F(", EE="));
            //Serial.print(nutrientSettings.error_ec);
            //Serial.print(F(", ST="));
            //Serial.print(nutrientSettings.supply_time);
            //Serial.print(F(", CT="));
            //Serial.print(nutrientSettings.cycle_time);
            //Serial.print(F(", Beds="));
            //Serial.print(nutrientSettings.bed_a);
            //Serial.print(nutrientSettings.bed_b);
            //Serial.print(nutrientSettings.bed_c);
            //Serial.println(nutrientSettings.bed_d);
        }
    }
    
    // 스케줄 처리
    if (doc.containsKey("sch")) {
        JsonObject schedule = doc["sch"];
        if (parseScheduleSettings(schedule)) {
            // 디버깅 출력
            //Serial.print(F("Schedule: "));
            //Serial.print(scheduleSettings.start_hour);
            //Serial.print(F(":"));
            //Serial.print(scheduleSettings.start_minute);
            //Serial.print(F("-"));
            //Serial.print(scheduleSettings.end_hour);
            //Serial.print(F(":"));
            //Serial.print(scheduleSettings.end_minute);
            //Serial.print(F(", TE="));
            //Serial.print(scheduleSettings.time_based_enabled);
            //Serial.print(F(", OE="));
            //Serial.print(scheduleSettings.once_based_enabled);
            //Serial.print(F(", DE="));
            //Serial.println(scheduleSettings.daily_based_enabled);
        }
    }
    
    // START 명령 처리 (설정 파싱 후)
    if (hasStartCommand) {
        if (!nutSystemFlags.isCycle) {
            manualStartMode = true;
            nutSystemFlags.scheduleEndRequested = false;
            startNewCycle();
            //Serial.println(F("Manual cycle started"));
        } else {
            //Serial.println(F("Cycle already running, ignoring START"));
        }
        return; // START 명령 처리 후 리턴
    }
    
    // 설정이 변경된 경우 자동 시작 로직 (START 명령이 없는 경우)
    if (doc.containsKey("set") || doc.containsKey("sch")) {
        manualStartMode = false;
        
        if (scheduleSettings.once_based_enabled) {
            //Serial.println(F("Once-based mode - starting immediate single cycle"));
            if (!nutSystemFlags.isCycle) {
                startNewCycle();
            }
        }
        else if (scheduleSettings.time_based_enabled) {
            //Serial.println(F("Time-based schedule enabled"));
            if (isCurrentTimeInRange()) {
                //Serial.println(F("In time range - starting cycle"));
                if (!nutSystemFlags.isCycle) {
                    nutSystemFlags.cycle_started_today = true;
                    startNewCycle();
                }
            }
            else {
                //Serial.println(F("Out of time range - waiting for schedule start"));
                if (!nutSystemFlags.isCycle) {
                    nutSystemFlags.isCycle = false;
                    cycle = -1;
                    cycleStatus = INACTIVE;
                    nutSystemFlags.cycle_started_today = false;
                }
            }
        }
        else if (scheduleSettings.daily_based_enabled) {
            //Serial.println(F("Interval-only mode - starting immediately"));
            if (!nutSystemFlags.isCycle) {
                startNewCycle();
            }
        }
    }
}

// ============= JSON 파싱 헬퍼 함수들 =============
bool parseNutrientSettings(JsonObject &json) {
    bool changed = false;
    
    if (json.containsKey("ph")) {
        nutrientSettings.target_ph = json["ph"].as<float>();
        changed = true;
    }
    if (json.containsKey("ec")) {
        nutrientSettings.target_ec = json["ec"].as<float>();
        changed = true;
    }
    if (json.containsKey("ep")) {
        nutrientSettings.error_ph = json["ep"].as<float>();
        changed = true;
    }
    if (json.containsKey("ee")) {
        nutrientSettings.error_ec = json["ee"].as<float>();
        changed = true;
    }
    if (json.containsKey("st")) {
        nutrientSettings.supply_time = json["st"].as<float>();
        changed = true;
    }
    if (json.containsKey("ct")) {
        nutrientSettings.cycle_time = json["ct"].as<float>();
        changed = true;
    }
    if (json.containsKey("a")) {
        nutrientSettings.bed_a = json["a"].as<int>() ? 1 : 0;
        changed = true;
    }
    if (json.containsKey("b")) {
        nutrientSettings.bed_b = json["b"].as<int>() ? 1 : 0;
        changed = true;
    }
    if (json.containsKey("c")) {
        nutrientSettings.bed_c = json["c"].as<int>() ? 1 : 0;
        changed = true;
    }
    if (json.containsKey("d")) {
        nutrientSettings.bed_d = json["d"].as<int>() ? 1 : 0;
        changed = true;
    }
    
    if (changed) {
        float cycle_time_minutes = nutrientSettings.cycle_time * 60.0f;
        if (!intervalValidation(nutrientSettings.supply_time, cycle_time_minutes)) {
            return false;
        }
        nutrientSettings.last_updated = millis();
    }
    
    return changed;
}

bool parseScheduleSettings(JsonObject &json) {
    bool changed = false;
    
    if (json.containsKey("te")) {
        scheduleSettings.time_based_enabled = json["te"].as<int>() ? 1 : 0;
        changed = true;
    }
    if (json.containsKey("de")) {
        scheduleSettings.daily_based_enabled = json["de"].as<int>() ? 1 : 0;
        changed = true;
    }
    if (json.containsKey("sh")) {
        scheduleSettings.start_hour = json["sh"].as<int>();
        changed = true;
    }
    if (json.containsKey("sm")) {
        scheduleSettings.start_minute = json["sm"].as<int>();
        changed = true;
    }
    if (json.containsKey("eh")) {
        scheduleSettings.end_hour = json["eh"].as<int>();
        changed = true;
    }
    if (json.containsKey("em")) {
        scheduleSettings.end_minute = json["em"].as<int>();
        changed = true;
    }
    if (json.containsKey("oe")) {
        scheduleSettings.once_based_enabled = json["oe"].as<int>() ? 1 : 0;
        changed = true;
    }
    
    if (changed) {
        if (!periodValidation(scheduleSettings.start_hour, scheduleSettings.start_minute,
                              scheduleSettings.end_hour, scheduleSettings.end_minute)) {
            return false;
        }
    }
    
    return changed;
}

bool periodValidation(int startHour, int startMinute, int endHour, int endMinute) {
    if (startHour < 0 || startHour > 23) return false;
    if (startMinute < 0 || startMinute > 59) return false;
    if (endHour < 0 || endHour > 23) return false;
    if (endMinute < 0 || endMinute > 59) return false;
    if (startHour == endHour && startMinute >= endMinute) return false;
    if (startHour == endHour && startMinute == endMinute) return false;
    return true;
}

bool intervalValidation(float supplyTime, float cycleTime) {
    if (supplyTime >= cycleTime) return false;
    if (supplyTime <= 0 && cycleTime <= 0) return false;
    if (supplyTime > 0 && cycleTime <= 0) {
        scheduleSettings.once_based_enabled = 1;
    }
    return true;
}

void motorInit(float cycleTime) {
    motorTimer.init = 1;
    motorTimer.currentMillis = 0;
    motorTimer.intervalMillis = (uint32_t)(cycleTime * 3600000.0f);
    motorTimer.cycleStartMillis = 0;
    motorTimer.lastCycleMillis = millis();
    motorTimer.isActive = 0;
    motorTimer.startMillis = 0;
    motorTimer.lastPrintTime = 0;
}

// ============= 센서 값 체크 함수들 =============
bool needAdjustPH() {
    if (isSkipPH()) return false;
    float current_ph = pH_Value;
    float target_ph = nutrientSettings.target_ph;
    float error_percentage = nutrientSettings.error_ph;
    float allowed_error = target_ph * (error_percentage / 100.0);
    return fabs(current_ph - target_ph) > allowed_error;
}

bool needDecreasePH() {
    if (isSkipPH()) return false;
    float current_ph = pH_Value;
    float target_ph = nutrientSettings.target_ph;
    float error_percentage = nutrientSettings.error_ph;
    float allowed_error = target_ph * (error_percentage / 100.0);
    return current_ph > (target_ph + allowed_error);
}

bool needIncreasePH() {
    if (isSkipPH()) return false;
    float current_ph = pH_Value;
    float target_ph = nutrientSettings.target_ph;
    float error_percentage = nutrientSettings.error_ph;
    float allowed_error = target_ph * (error_percentage / 100.0);
    return current_ph < (target_ph - allowed_error);
}

bool needAdjustEC() {
    if (isSkipEC()) return false;
    float current_ec = ecValue / 1000.0f; // μS/cm → dS/m 변환
    float target_ec = nutrientSettings.target_ec;
    float error_percentage = nutrientSettings.error_ec;
    float allowed_error = target_ec * (error_percentage / 100.0);
    return fabs(current_ec - target_ec) > allowed_error;
}

bool needIncreaseEC() {
    if (isSkipEC()) return false;
    float current_ec = ecValue / 1000.0f; // μS/cm → dS/m 변환
    float target_ec = nutrientSettings.target_ec;
    float error_percentage = nutrientSettings.error_ec;
    float allowed_error = target_ec * (error_percentage / 100.0);
    return current_ec < (target_ec - allowed_error);
}

bool needDecreaseEC() {
    if (isSkipEC()) return false;
    float current_ec = ecValue / 1000.0f; // μS/cm → dS/m 변환
    float target_ec = nutrientSettings.target_ec;
    float error_percentage = nutrientSettings.error_ec;
    float allowed_error = target_ec * (error_percentage / 100.0);
    return current_ec > (target_ec + allowed_error);
}

// ============= 펄스 제어 함수들 =============
void startECPulse() {
    pulseFlags.ec_pulse_active = 1;
    ec_last_toggle = millis();
    pulseFlags.ec_valve_state = 1;
    uint8_t channels[] = {UNO_CH_EC, UNO_CH_EC2};
    bool oldStates[] = {getRelayStatus(UNO_CH_EC), getRelayStatus(UNO_CH_EC2)};
    bool newStates[] = {HIGH, HIGH};
    setRelay(UNO_CH_EC, HIGH);
    setRelay(UNO_CH_EC2, HIGH);
    printRelayChanges(F("EC pulse start"), channels, oldStates, newStates, 2);
}

void startPHPulse() {
    pulseFlags.ph_pulse_active = 1;
    ph_last_toggle = millis();
    pulseFlags.ph_valve_state = 1;
    uint8_t channels[] = {UNO_CH_PH};
    bool oldStates[] = {getRelayStatus(UNO_CH_PH)};
    bool newStates[] = {HIGH};
    setRelay(UNO_CH_PH, HIGH);
    printRelayChanges(F("pH pulse start"), channels, oldStates, newStates, 1);
}

void stopECPulse() {
    if (pulseFlags.ec_pulse_active) {
        pulseFlags.ec_pulse_active = 0;
        pulseFlags.ec_valve_state = 0;
        uint8_t channels[] = {UNO_CH_EC, UNO_CH_EC2};
        bool oldStates[] = {getRelayStatus(UNO_CH_EC), getRelayStatus(UNO_CH_EC2)};
        bool newStates[] = {LOW, LOW};
        setRelay(UNO_CH_EC, LOW);
        setRelay(UNO_CH_EC2, LOW);
        
        // EC pulse STOP 자가복구 확인 (case 전환 시 중요)
        delay(10); // 하드웨어 안정화
        bool actualEC = getRelayStatus(UNO_CH_EC);
        bool actualEC2 = getRelayStatus(UNO_CH_EC2);
        
        if (actualEC != LOW || actualEC2 != LOW) {
            //Serial.print(F("EC pulse stop recovery: EC="));
            //Serial.print(actualEC ? F("H") : F("L"));
            //Serial.print(F(" EC2="));
            //Serial.print(actualEC2 ? F("H") : F("L"));
            //Serial.print(F(" -> retrying..."));
            
            setRelay(UNO_CH_EC, LOW);
            setRelay(UNO_CH_EC2, LOW);
            delay(10);
            
            actualEC = getRelayStatus(UNO_CH_EC);
            actualEC2 = getRelayStatus(UNO_CH_EC2);
            
            if (actualEC == LOW && actualEC2 == LOW) {
                //Serial.println(F(" OK"));
            } else {
                //Serial.println(F(" FAILED"));
            }
        }
        
        printRelayChanges(F("EC pulse stop"), channels, oldStates, newStates, 2);
    }
}

void stopPHPulse() {
    if (pulseFlags.ph_pulse_active) {
        pulseFlags.ph_pulse_active = 0;
        pulseFlags.ph_valve_state = 0;
        uint8_t channels[] = {UNO_CH_PH};
        bool oldStates[] = {getRelayStatus(UNO_CH_PH)};
        bool newStates[] = {LOW};
        setRelay(UNO_CH_PH, LOW);
        
        // pH pulse STOP 자가복구 확인 (case 전환 시 중요)
        delay(10); // 하드웨어 안정화
        bool actualPH = getRelayStatus(UNO_CH_PH);
        
        if (actualPH != LOW) {
            //Serial.print(F("pH pulse stop recovery: PH="));
            //Serial.print(actualPH ? F("H") : F("L"));
            //Serial.print(F(" -> retrying..."));
            
            setRelay(UNO_CH_PH, LOW);
            delay(10);
            
            actualPH = getRelayStatus(UNO_CH_PH);
            
            if (actualPH == LOW) {
                //Serial.println(F(" OK"));
            } else {
                //Serial.println(F(" FAILED"));
            }
        }
        
        printRelayChanges(F("pH pulse stop"), channels, oldStates, newStates, 1);
    }
}

void updatePulseControl() {
    if (!nutSystemFlags.isCycle || cycle < 1 || cycle > 7) {
        if (pulseFlags.ec_pulse_active || pulseFlags.ph_pulse_active) {
            stopECPulse();
            stopPHPulse();
        }
        return;
    }
    
    uint32_t currentTime = millis();
    
    if (pulseFlags.ec_pulse_active) {
        if (cycle >= 3) {
            stopECPulse();
            return;
        }
        if (currentTime - ec_last_toggle >= PULSE_DURATION_MS) {
            pulseFlags.ec_valve_state = !pulseFlags.ec_valve_state;
            setRelay(UNO_CH_EC, pulseFlags.ec_valve_state);
            setRelay(UNO_CH_EC2, pulseFlags.ec_valve_state);
            // 실제 핀 상태 확인
            bool actualEC = getRelayStatus(UNO_CH_EC);
            bool actualEC2 = getRelayStatus(UNO_CH_EC2);
            //Serial.print(F("EC pulse toggle actual: "));
            //Serial.print(actualEC ? F("H") : F("L"));
            //Serial.print(F("/"));
            //Serial.println(actualEC2 ? F("H") : F("L"));
            ec_last_toggle = currentTime;
        }
    }
    
    if (pulseFlags.ph_pulse_active) {
        if (currentTime - ph_last_toggle >= PULSE_DURATION_MS) {
            pulseFlags.ph_valve_state = !pulseFlags.ph_valve_state;
            setRelay(UNO_CH_PH, pulseFlags.ph_valve_state);
            // 실제 핀 상태 확인
            bool actualPH = getRelayStatus(UNO_CH_PH);
            //Serial.print(F("pH pulse toggle actual: "));
            //Serial.println(actualPH ? F("H") : F("L"));
            ph_last_toggle = currentTime;
        }
    }
}

// ============= 타이머 관련 함수들 =============
void initIrrigationTimer() {
    irrigationTimer.totalRunTime = 0;
    irrigationTimer.lastStartTime = 0;
    irrigationTimer.pausedDuration = 0;
    irrigationTimer.targetDuration = (uint32_t)(nutrientSettings.supply_time * 60000);
    irrigationTimer.isPaused = 0;
    irrigationTimer.isActive = 0;
}

void startIrrigationTimer() {
    irrigationTimer.isActive = 1;
    irrigationTimer.isPaused = 0;
    irrigationTimer.lastStartTime = millis();
    irrigationTimer.totalRunTime = 0;
    irrigationTimer.pausedDuration = 0;
    irrigationTimer.targetDuration = (uint32_t)(nutrientSettings.supply_time * 60000);
}

void pauseIrrigationTimer() {
    if (irrigationTimer.isActive && !irrigationTimer.isPaused) {
        irrigationTimer.totalRunTime += (millis() - irrigationTimer.lastStartTime);
        irrigationTimer.isPaused = 1;
    }
}

void resumeIrrigationTimer() {
    if (irrigationTimer.isActive && irrigationTimer.isPaused) {
        irrigationTimer.isPaused = 0;
        irrigationTimer.lastStartTime = millis();
    }
}

void stopIrrigationTimer() {
    if (irrigationTimer.isActive && !irrigationTimer.isPaused) {
        irrigationTimer.totalRunTime += (millis() - irrigationTimer.lastStartTime);
    }
    irrigationTimer.isActive = 0;
    irrigationTimer.isPaused = 0;
}

uint32_t getIrrigationElapsedTime() {
    if (!irrigationTimer.isActive) return 0;
    if (irrigationTimer.isPaused) {
        return irrigationTimer.totalRunTime;
    } else {
        return irrigationTimer.totalRunTime + (millis() - irrigationTimer.lastStartTime);
    }
}

bool isIrrigationComplete() {
    return getIrrigationElapsedTime() >= irrigationTimer.targetDuration;
}

void initPhEcCheckTimer() {
    phEcCheckTimer.lastCheckTime = 0;
    phEcCheckTimer.checkStartTime = 0;
    phEcCheckTimer.isRunning = 0;
}

void startPhEcCheckTimer() {
    phEcCheckTimer.isRunning = 1;
    phEcCheckTimer.checkStartTime = millis();
    phEcCheckTimer.lastCheckTime = millis();
}

void stopPhEcCheckTimer() {
    phEcCheckTimer.isRunning = 0;
    phEcCheckTimer.checkStartTime = 0;
    phEcCheckTimer.lastCheckTime = 0;
}

bool isPhEcCheckTime() {
    if (!phEcCheckTimer.isRunning) return false;
    return (millis() - phEcCheckTimer.lastCheckTime) >= PH_EC_CHECK_INTERVAL;
}

// ============= 시간 관련 함수들 =============
int getCurrentTimeInMinutes() {
    return currentHour * 60 + currentMinute;
}

int getTimeInMinutes(int hour, int minute) {
    return hour * 60 + minute;
}

bool isCurrentTimeInRange() {
    if (!scheduleSettings.time_based_enabled) return true;
    if (!nutSystemFlags.timeReceived) return false;
    
    int currentTimeMinutes = getCurrentTimeInMinutes();
    int startTimeMinutes = getTimeInMinutes(scheduleSettings.start_hour, scheduleSettings.start_minute);
    int endTimeMinutes = getTimeInMinutes(scheduleSettings.end_hour, scheduleSettings.end_minute);
    
    if (startTimeMinutes > endTimeMinutes) {
        return (currentTimeMinutes >= startTimeMinutes || currentTimeMinutes <= endTimeMinutes);
    } else {
        return (currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes);
    }
}

void checkDailyReset() {
    static int8_t last_reset_hour = -1;
    if (scheduleSettings.time_based_enabled) {
        int startTimeMinutes = getTimeInMinutes(scheduleSettings.start_hour, scheduleSettings.start_minute);
        int endTimeMinutes = getTimeInMinutes(scheduleSettings.end_hour, scheduleSettings.end_minute);
        bool isOvernight = (startTimeMinutes > endTimeMinutes);
        
        bool shouldReset = false;
        if (isOvernight) {
            if (getCurrentTimeInMinutes() == startTimeMinutes && last_reset_hour != scheduleSettings.start_hour) {
                shouldReset = true;
            }
        } else {
            if (currentHour == 0 && last_reset_hour != 0) {
                shouldReset = true;
            }
        }
        
        if (shouldReset) {
            nutSystemFlags.cycle_started_today = false;
            last_reset_hour = currentHour;
        }
    }
}

// ============= 사이클 메인 함수들 =============
void startNewCycle() {
    if (cycle < 6) {
        //Serial.println(F("New cycle start"));
        allPinsOff();
        setPumpStatus(false);
    }
    
    memset(&cycleVars, 0, sizeof(cycleVars));
    initIrrigationTimer();
    initPhEcCheckTimer();
    
    motorTimer.lastCycleMillis = millis();
    nutSystemFlags.isCycle = true;
    nutSystemFlags.scheduleEndRequested = false;
    
    bool immediateIrrigation = skipAllMixing();
    cycle = immediateIrrigation ? 6 : 1;
    cycleStatus = immediateIrrigation ? IRRIGATING : MIXING;
    cycle_start_time = millis();
    
    setPumpStatus(true);
    
    //Serial.print(F("New nutrient cycle started - cycle: "));
    //Serial.println(cycle);
    
    // 실제 핀 상태 확인
    //Serial.print(F("New cycle actual: PUMP="));
    //Serial.print(getRelayStatus(UNO_CH_PUMP) ? F("H") : F("L"));
    //Serial.print(F(" EC="));
    //Serial.print(getRelayStatus(UNO_CH_EC) ? F("H") : F("L"));
    //Serial.print(F(" PH="));
    //Serial.print(getRelayStatus(UNO_CH_PH) ? F("H") : F("L"));
    //Serial.print(F(" BED="));
    //Serial.print(getRelayStatus(UNO_CH_BED_A) ? F("H") : F("L"));
    //Serial.print(getRelayStatus(UNO_CH_BED_B) ? F("H") : F("L"));
    //Serial.print(getRelayStatus(UNO_CH_BED_C) ? F("H") : F("L"));
    //Serial.println(getRelayStatus(UNO_CH_BED_D) ? F("H") : F("L"));
    
    if (cycle >= 6) {
        nutSystemFlags.pumpRunning = true;
        startIrrigationTimer();
        startPhEcCheckTimer();
    } else {
        nutSystemFlags.pumpRunning = false;
    }
    
}

void updateCycle() {
    switch (cycle) {
    case 1: // 초기화 및 pH/EC 체크
        if (!cycleVars.initial_sensor_check) {
            delay(1000);
            //Serial.println(F("NUT CYCLE [1]: Initial pH/EC check"));
            cycleVars.pump_check_start_time = millis();
            setPumpStatus(true);
            cycleVars.initial_sensor_check = 1;
            cycleStatus = MIXING;
        }
        
        if (cycleVars.initial_sensor_check && (millis() - cycleVars.pump_check_start_time >= 5000)) {
            if (!getPumpStatus()) {
                setPumpStatus(true);
            }
            bool ph_in_range = !needAdjustPH();
            bool ec_in_range = !needAdjustEC();
            
            if (ph_in_range && ec_in_range) {
                //Serial.println(F("Initial pH and EC are within target range!"));
                cycle = 5;
                return;
            }
        }
        
        if (cycleVars.initial_sensor_check && (millis() - cycleVars.pump_check_start_time >= 20000)) {
            //Serial.println(F("Initial check completed, moving to EC adjustment"));
            cycle = 2;
        }
        break;
        
    case 2: // EC 조정
        if (!cycleVars.ec_adjustment_started) {
            //Serial.println(F("NUT CYCLE [2]: Adjusting EC levels"));
            if (needIncreaseEC()) {
                //Serial.println(F("Increasing EC"));
                startECPulse();
                cycleVars.ec_adjust_start_time = millis();
                cycleVars.ec_adjustment_started = 1;
            } else if (needDecreaseEC()) {
                //Serial.println(F("EC too high - diluting"));
                stopECPulse();
                cycleVars.ec_adjust_start_time = millis();
                cycleVars.ec_adjustment_started = 1;
            } else {
                //Serial.println(F("EC is already in acceptable range"));
                cycle = 3;
                return;
            }
        }
        
        if (cycleVars.ec_adjustment_started) {
            if (millis() - cycleVars.ec_last_sensor_request >= 5000) {
                cycleVars.ec_last_sensor_request = millis();
                if (!needAdjustEC()) {
                    //Serial.println(F("EC adjustment successful!"));
                    stopECPulse();
                    cycle = 3;
                    return;
                }
            }
            
            if (millis() - cycleVars.ec_adjust_start_time >= 30000) {
                //Serial.println(F("EC adjustment completed (timeout)"));
                stopECPulse();
                cycle = 3;
            }
        }
        break;
        
    case 3: // pH 조정 전 체크
        //Serial.println(F("NUT CYCLE [3]: Rechecking pH levels"));
        if (pulseFlags.ec_pulse_active) {
            stopECPulse();
        }
        
        if (!needAdjustPH()) {
            //Serial.println(F("pH is already in acceptable range"));
            cycle = 5;
        } else {
            //Serial.println(F("pH needs adjustment"));
            cycle = 4;
        }
        break;
        
    case 4: // pH 조정
        if (!cycleVars.ph_adjustment_started) {
            //Serial.println(F("NUT CYCLE [4]: Adjusting pH levels"));
            if (needDecreasePH()) {
                //Serial.println(F("pH too high - starting pH pulse"));
                startPHPulse();
                cycleVars.ph_adjust_start_time = millis();
                cycleVars.ph_adjustment_started = 1;
            } else if (needIncreasePH()) {
                //Serial.println(F("pH too low - diluting"));
                stopPHPulse();
                cycleVars.ph_adjust_start_time = millis();
                cycleVars.ph_adjustment_started = 1;
            } else {
                //Serial.println(F("pH is already in acceptable range"));
                cycle = 5;
                return;
            }
        }
        
        if (cycleVars.ph_adjustment_started) {
            if (millis() - cycleVars.ph_last_sensor_request >= 5000) {
                cycleVars.ph_last_sensor_request = millis();
                if (!needAdjustPH()) {
                    //Serial.println(F("pH adjustment successful!"));
                    stopPHPulse();
                    cycle = 5;
                    return;
                }
            }
            
            if (millis() - cycleVars.ph_adjust_start_time >= 30000) {
                stopPHPulse();
                //Serial.println(F("pH adjustment completed (timeout)"));
                cycle = 5;
            }
        }
        break;
        
    case 5: // 최종 확인
        if (!cycleVars.final_check_started) {
            //Serial.println(F("NUT CYCLE [5]: Final pH/EC verification"));
            cycleVars.final_check_start_time = millis();
            cycleVars.final_check_started = 1;
        }
        
        if (cycleVars.final_check_started && (millis() - cycleVars.final_check_start_time >= 5000)) {
            bool ph_in_range = !needAdjustPH();
            bool ec_in_range = !needAdjustEC();
            
            if (ph_in_range && ec_in_range) {
                //Serial.println(F("Final check passed!"));
                cycle = 6;
                return;
            }
        }
        
        if (cycleVars.final_check_started && (millis() - cycleVars.final_check_start_time >= 20000)) {
            //Serial.println(F("Final check completed - starting irrigation"));
            cycle = 6;
        }
        break;
        
    case 6: { // 관수 시작
        //Serial.println(F("NUT CYCLE [6]: Starting irrigation"));
        
        if (!getPumpStatus()) {
            setPumpStatus(true);
        }
        
        // EC/PH 밸브 OFF
        uint8_t valveChannels[] = {UNO_CH_EC, UNO_CH_EC2, UNO_CH_PH};
        bool valveOldStates[] = {getRelayStatus(UNO_CH_EC), getRelayStatus(UNO_CH_EC2), getRelayStatus(UNO_CH_PH)};
        bool valveNewStates[] = {LOW, LOW, LOW};
        setRelay(UNO_CH_EC, LOW);
        setRelay(UNO_CH_EC2, LOW);
        setRelay(UNO_CH_PH, LOW);
        printRelayChanges(F("EC/PH valve OFF"), valveChannels, valveOldStates, valveNewStates, 3);
        delay(500);
        
        // 베드 ON
        uint8_t bedChannels[4];
        bool bedOldStates[4];
        bool bedNewStates[4];
        uint8_t bedCount = 0;
        if (nutrientSettings.bed_a) {
            bedChannels[bedCount] = UNO_CH_BED_A;
            bedOldStates[bedCount] = getRelayStatus(UNO_CH_BED_A);
            bedNewStates[bedCount] = HIGH;
            bedCount++;
        }
        if (nutrientSettings.bed_b) {
            bedChannels[bedCount] = UNO_CH_BED_B;
            bedOldStates[bedCount] = getRelayStatus(UNO_CH_BED_B);
            bedNewStates[bedCount] = HIGH;
            bedCount++;
        }
        if (nutrientSettings.bed_c) {
            bedChannels[bedCount] = UNO_CH_BED_C;
            bedOldStates[bedCount] = getRelayStatus(UNO_CH_BED_C);
            bedNewStates[bedCount] = HIGH;
            bedCount++;
        }
        if (nutrientSettings.bed_d) {
            bedChannels[bedCount] = UNO_CH_BED_D;
            bedOldStates[bedCount] = getRelayStatus(UNO_CH_BED_D);
            bedNewStates[bedCount] = HIGH;
            bedCount++;
        }
        
        for (uint8_t i = 0; i < bedCount; i++) {
            setRelay(bedChannels[i], HIGH);
        }
        
        // 베드 자가복구 확인 (중요 릴레이)
        delay(10); // 하드웨어 안정화
        bool bedRecoveryNeeded = false;
        if (nutrientSettings.bed_a && getRelayStatus(UNO_CH_BED_A) != HIGH) bedRecoveryNeeded = true;
        if (nutrientSettings.bed_b && getRelayStatus(UNO_CH_BED_B) != HIGH) bedRecoveryNeeded = true;
        if (nutrientSettings.bed_c && getRelayStatus(UNO_CH_BED_C) != HIGH) bedRecoveryNeeded = true;
        if (nutrientSettings.bed_d && getRelayStatus(UNO_CH_BED_D) != HIGH) bedRecoveryNeeded = true;
        
        if (bedRecoveryNeeded) {
            //Serial.print(F("Bed recovery: "));
            for (uint8_t i = 0; i < bedCount; i++) {
                bool actualState = getRelayStatus(bedChannels[i]);
                if (actualState != HIGH) {
                    //Serial.print(F("CH"));
                    //Serial.print(bedChannels[i]);
                    //Serial.print(F("="));
                    //Serial.print(actualState ? F("H") : F("L"));
                    //Serial.print(F(" "));
                    setRelay(bedChannels[i], HIGH);
                }
            }
            //Serial.print(F("-> retrying..."));
            delay(10);
            
            // 복구 확인
            bool allOK = true;
            if (nutrientSettings.bed_a && getRelayStatus(UNO_CH_BED_A) != HIGH) allOK = false;
            if (nutrientSettings.bed_b && getRelayStatus(UNO_CH_BED_B) != HIGH) allOK = false;
            if (nutrientSettings.bed_c && getRelayStatus(UNO_CH_BED_C) != HIGH) allOK = false;
            if (nutrientSettings.bed_d && getRelayStatus(UNO_CH_BED_D) != HIGH) allOK = false;
            
            //Serial.println(allOK ? F(" OK") : F(" FAILED"));
        }
        
        if (bedCount > 0) {
            printRelayChanges(F("Bed ON"), bedChannels, bedOldStates, bedNewStates, bedCount);
            // 실제 핀 상태 확인 (메모리 절약을 위해 제거)
            //Serial.print(F("Bed actual: "));
            //if (nutrientSettings.bed_a) Serial.print(getRelayStatus(UNO_CH_BED_A) ? F("A") : F("a"));
            //if (nutrientSettings.bed_b) Serial.print(getRelayStatus(UNO_CH_BED_B) ? F("B") : F("b"));
            //if (nutrientSettings.bed_c) Serial.print(getRelayStatus(UNO_CH_BED_C) ? F("C") : F("c"));
            //if (nutrientSettings.bed_d) Serial.print(getRelayStatus(UNO_CH_BED_D) ? F("D") : F("d"));
            //Serial.println();
        }
        
        nutSystemFlags.pumpRunning = true;
        
        if (!irrigationTimer.isActive) {
            startIrrigationTimer();
        } else if (irrigationTimer.isPaused) {
            resumeIrrigationTimer();
        }
        
        startPhEcCheckTimer();
        cycle = 7;
        break;
    }
        
    case 7: // 관수 진행 중
        // 관수 남은 시간 디버깅 (5초마다)
        {
            static uint32_t lastIrrigationDebug = 0;
            if (millis() - lastIrrigationDebug >= 5000) {
                lastIrrigationDebug = millis();
                uint32_t elapsed = getIrrigationElapsedTime();
                uint32_t remaining = (elapsed >= irrigationTimer.targetDuration) ? 0 : (irrigationTimer.targetDuration - elapsed);
                //Serial.print(F("Irrigation progress: "));
                //Serial.print(elapsed / 1000);
                //Serial.print(F("s / "));
                //Serial.print(irrigationTimer.targetDuration / 1000);
                //Serial.print(F("s (remaining "));
                //Serial.print(remaining / 1000);
                //Serial.println(F("s)"));
            }
        }
        
        if (isIrrigationComplete()) {
            stopIrrigationTimer();
            stopPhEcCheckTimer();
            //Serial.println(F("Irrigation complete"));
            allPinsOff();
            setPumpStatus(false);
            
            // 관수 완료 후 자가복구 확인 (중요 릴레이)
            delay(10); // 하드웨어 안정화
            bool recoveryNeeded = false;
            if (getRelayStatus(UNO_CH_PUMP) != LOW) recoveryNeeded = true;
            if (getRelayStatus(UNO_CH_BED_A) != LOW) recoveryNeeded = true;
            if (getRelayStatus(UNO_CH_BED_B) != LOW) recoveryNeeded = true;
            if (getRelayStatus(UNO_CH_BED_C) != LOW) recoveryNeeded = true;
            if (getRelayStatus(UNO_CH_BED_D) != LOW) recoveryNeeded = true;
            
            if (recoveryNeeded) {
                //Serial.print(F("Irrigation complete recovery: "));
                if (getRelayStatus(UNO_CH_PUMP) != LOW) {
                    //Serial.print(F("PUMP=H "));
                    setRelay(UNO_CH_PUMP, LOW);
                }
                if (getRelayStatus(UNO_CH_BED_A) != LOW) {
                    //Serial.print(F("BED_A=H "));
                    setRelay(UNO_CH_BED_A, LOW);
                }
                if (getRelayStatus(UNO_CH_BED_B) != LOW) {
                    //Serial.print(F("BED_B=H "));
                    setRelay(UNO_CH_BED_B, LOW);
                }
                if (getRelayStatus(UNO_CH_BED_C) != LOW) {
                    //Serial.print(F("BED_C=H "));
                    setRelay(UNO_CH_BED_C, LOW);
                }
                if (getRelayStatus(UNO_CH_BED_D) != LOW) {
                    //Serial.print(F("BED_D=H "));
                    setRelay(UNO_CH_BED_D, LOW);
                }
                //Serial.print(F("-> retrying..."));
                delay(10);
                
                // 복구 확인
                bool allOK = (getRelayStatus(UNO_CH_PUMP) == LOW &&
                             getRelayStatus(UNO_CH_BED_A) == LOW &&
                             getRelayStatus(UNO_CH_BED_B) == LOW &&
                             getRelayStatus(UNO_CH_BED_C) == LOW &&
                             getRelayStatus(UNO_CH_BED_D) == LOW);
                //Serial.println(allOK ? F(" OK") : F(" FAILED"));
            }
            
            // 실제 핀 상태 확인
            //Serial.print(F("OFF after irrigation actual: PUMP="));
            //Serial.print(getRelayStatus(UNO_CH_PUMP) ? F("H") : F("L"));
            //Serial.print(F(" BED="));
            //Serial.print(getRelayStatus(UNO_CH_BED_A) ? F("H") : F("L"));
            //Serial.print(getRelayStatus(UNO_CH_BED_B) ? F("H") : F("L"));
            //Serial.print(getRelayStatus(UNO_CH_BED_C) ? F("H") : F("L"));
            //Serial.println(getRelayStatus(UNO_CH_BED_D) ? F("H") : F("L"));
            nutSystemFlags.pumpRunning = false;
            
            if (manualStartMode) {
                nutSystemFlags.isCycle = false;
                cycle = -1;
                cycleStatus = INACTIVE;
                manualStartMode = false;
            } else if (scheduleSettings.once_based_enabled) {
                nutSystemFlags.isCycle = false;
                cycle = -1;
                cycleStatus = INACTIVE;
            } else if (scheduleSettings.time_based_enabled && !isCurrentTimeInRange()) {
                nutSystemFlags.isCycle = false;
                cycle = -1;
                cycleStatus = INACTIVE;
            } else if (scheduleSettings.daily_based_enabled) {
                nutSystemFlags.isCycle = true;
                cycle = 0;
                cycleStatus = WAITING;
            } else {
                nutSystemFlags.isCycle = false;
                cycle = -1;
                cycleStatus = INACTIVE;
            }
            return;
        }
        
        if (isPhEcCheckTime() && nutSystemFlags.pumpRunning && !irrigationTimer.isPaused) {
            if (scheduleSettings.time_based_enabled && !isCurrentTimeInRange()) {
                phEcCheckTimer.lastCheckTime = millis();
                return;
            }
            
            bool ph_needs_adjust = needAdjustPH();
            bool ec_needs_adjust = needAdjustEC();
            
            if (ph_needs_adjust || ec_needs_adjust) {
                //Serial.println(F("pH/EC out of range - remixing"));
                pauseIrrigationTimer();
                stopPhEcCheckTimer();
                nutSystemFlags.pumpRunning = false;
                allPinsOff();
                setPumpStatus(false);
                
                // pH/EC 범위 벗어남 후 자가복구 확인 (중요 릴레이)
                delay(10); // 하드웨어 안정화
                bool recoveryNeeded = false;
                if (getRelayStatus(UNO_CH_PUMP) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_EC) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_EC2) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_PH) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_BED_A) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_BED_B) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_BED_C) != LOW) recoveryNeeded = true;
                if (getRelayStatus(UNO_CH_BED_D) != LOW) recoveryNeeded = true;
                
                if (recoveryNeeded) {
                    //Serial.print(F("Out of range recovery: "));
                    if (getRelayStatus(UNO_CH_PUMP) != LOW) {
                        //Serial.print(F("PUMP=H "));
                        setRelay(UNO_CH_PUMP, LOW);
                    }
                    if (getRelayStatus(UNO_CH_EC) != LOW) {
                        //Serial.print(F("EC=H "));
                        setRelay(UNO_CH_EC, LOW);
                    }
                    if (getRelayStatus(UNO_CH_EC2) != LOW) {
                        //Serial.print(F("EC2=H "));
                        setRelay(UNO_CH_EC2, LOW);
                    }
                    if (getRelayStatus(UNO_CH_PH) != LOW) {
                        //Serial.print(F("PH=H "));
                        setRelay(UNO_CH_PH, LOW);
                    }
                    if (getRelayStatus(UNO_CH_BED_A) != LOW) {
                        //Serial.print(F("BED_A=H "));
                        setRelay(UNO_CH_BED_A, LOW);
                    }
                    if (getRelayStatus(UNO_CH_BED_B) != LOW) {
                        //Serial.print(F("BED_B=H "));
                        setRelay(UNO_CH_BED_B, LOW);
                    }
                    if (getRelayStatus(UNO_CH_BED_C) != LOW) {
                        //Serial.print(F("BED_C=H "));
                        setRelay(UNO_CH_BED_C, LOW);
                    }
                    if (getRelayStatus(UNO_CH_BED_D) != LOW) {
                        //Serial.print(F("BED_D=H "));
                        setRelay(UNO_CH_BED_D, LOW);
                    }
                    //Serial.print(F("-> retrying..."));
                    delay(10);
                    
                    // 복구 확인
                    bool allOK = (getRelayStatus(UNO_CH_PUMP) == LOW &&
                                 getRelayStatus(UNO_CH_EC) == LOW &&
                                 getRelayStatus(UNO_CH_EC2) == LOW &&
                                 getRelayStatus(UNO_CH_PH) == LOW &&
                                 getRelayStatus(UNO_CH_BED_A) == LOW &&
                                 getRelayStatus(UNO_CH_BED_B) == LOW &&
                                 getRelayStatus(UNO_CH_BED_C) == LOW &&
                                 getRelayStatus(UNO_CH_BED_D) == LOW);
                    //Serial.println(allOK ? F(" OK") : F(" FAILED"));
                }
                
                // 실제 핀 상태 확인
                //Serial.print(F("OFF after out of range actual: PUMP="));
                //Serial.print(getRelayStatus(UNO_CH_PUMP) ? F("H") : F("L"));
                //Serial.print(F(" EC="));
                //Serial.print(getRelayStatus(UNO_CH_EC) ? F("H") : F("L"));
                //Serial.print(F(" PH="));
                //Serial.print(getRelayStatus(UNO_CH_PH) ? F("H") : F("L"));
                //Serial.print(F(" BED="));
                //Serial.print(getRelayStatus(UNO_CH_BED_A) ? F("H") : F("L"));
                //Serial.print(getRelayStatus(UNO_CH_BED_B) ? F("H") : F("L"));
                //Serial.print(getRelayStatus(UNO_CH_BED_C) ? F("H") : F("L"));
                //Serial.println(getRelayStatus(UNO_CH_BED_D) ? F("H") : F("L"));
                memset(&cycleVars, 0, sizeof(cycleVars));
                cycle = 1;
                cycleStatus = MIXING;
                return;
            } else {
                phEcCheckTimer.lastCheckTime = millis();
            }
        }
        break;
    }
}

void checkCycleRestart() {
    if (scheduleSettings.time_based_enabled) {
        if (isCurrentTimeInRange() && !nutSystemFlags.cycle_started_today && !nutSystemFlags.isCycle) {
            //Serial.println(F("Daily schedule start time reached"));
            nutSystemFlags.cycle_started_today = true;
            startNewCycle();
            return;
        }
        if (!isCurrentTimeInRange()) {
            if (cycle == 0 && nutSystemFlags.cycle_started_today) {
                nutSystemFlags.isCycle = false;
                cycle = -1;
                cycleStatus = INACTIVE;
            }
            return;
        }
    }
    
    if (nutrientSettings.cycle_time <= 0.001f || cycle != 0) return;
    
    // 다음 관수까지 시간 디버깅 (2초마다)
    {
        static uint32_t lastNextCycleDebug = 0;
        if (millis() - lastNextCycleDebug >= 2000) {
            lastNextCycleDebug = millis();
            if (scheduleSettings.time_based_enabled) {
                // 시간 기반 스케줄: 다음 시작 시간까지 남은 시간 계산
                int currentMin = getCurrentTimeInMinutes();
                int startMin = getTimeInMinutes(scheduleSettings.start_hour, scheduleSettings.start_minute);
                int endMin = getTimeInMinutes(scheduleSettings.end_hour, scheduleSettings.end_minute);
                
                int nextStartMin;
                if (currentMin < startMin) {
                    // 오늘 시작 시간까지
                    nextStartMin = startMin - currentMin;
                } else if (currentMin < endMin) {
                    // 오늘은 이미 시작됨, 내일 시작 시간까지
                    nextStartMin = (24 * 60 - currentMin) + startMin;
                } else {
                    // 내일 시작 시간까지
                    nextStartMin = (24 * 60 - currentMin) + startMin;
                }
                
                //Serial.print(F("Time until next irrigation: "));
                //Serial.print(nextStartMin / 60);
                //Serial.print(F("h "));
                //Serial.print(nextStartMin % 60);
                //Serial.println(F("m"));
            } else {
                // 간격 기반: cycle_time 기준
                uint32_t currentTime = millis();
                uint32_t intervalMillis = (uint32_t)(nutrientSettings.cycle_time * 3600000.0f);
                uint32_t elapsedTime = currentTime - motorTimer.lastCycleMillis;
                uint32_t remainingTime = (elapsedTime >= intervalMillis) ? 0 : (intervalMillis - elapsedTime);
                
                //Serial.print(F("Time until next irrigation: "));
                //Serial.print(remainingTime / 3600000);
                //Serial.print(F("h "));
                //Serial.print((remainingTime % 3600000) / 60000);
                //Serial.println(F("m"));
            }
        }
    }
    
    if (scheduleSettings.time_based_enabled) {
        if (!isCurrentTimeInRange()) return;
        // 간격 체크 로직 (간소화)
    } else {
        uint32_t currentTime = millis();
        uint32_t intervalMillis = (uint32_t)(nutrientSettings.cycle_time * 3600000.0f);
        uint32_t elapsedTime = currentTime - motorTimer.lastCycleMillis;
        
        if (elapsedTime >= intervalMillis && !nutSystemFlags.scheduleEndRequested) {
            //Serial.println(F("New nutrient cycle auto start!"));
            startNewCycle();
            return;
        }
    }
    
    cycleStatus = WAITING;
}

