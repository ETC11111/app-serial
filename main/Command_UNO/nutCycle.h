#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#define UNO_CH_BED_A   0
#define UNO_CH_BED_B   1
#define UNO_CH_BED_C   2
#define UNO_CH_BED_D   3
#define UNO_CH_EC      4
#define UNO_CH_EC2     5
#define UNO_CH_PH      6
#define UNO_CH_NULL    7
#define UNO_CH_PUMP    8
#define UNO_CH_NULL2   9

#define PH_EC_CHECK_INTERVAL 90000  // 90초 간격
#define PULSE_DURATION_MS 2000UL     // 펄스 토글 주기(2초)

// ============= 열거형 정의 =============
enum CycleStatus : uint8_t {
    INACTIVE = 0,
    MIXING   = 1,
    IRRIGATING = 2,
    WAITING  = 3
};

// ============= 구조체 정의 =============
struct NutrientSettings {
    float target_ph;
    float target_ec;
    float error_ph;
    float error_ec;
    float supply_time;    // 관수시간(분)
    float cycle_time;     // 주기시간(시간)
    uint8_t bed_a : 1;
    uint8_t bed_b : 1;
    uint8_t bed_c : 1;
    uint8_t bed_d : 1;
    uint8_t reserved : 4;
    uint32_t last_updated;
};

struct ScheduleSettings {
    uint8_t start_hour, start_minute;
    uint8_t end_hour, end_minute;
    uint8_t time_based_enabled : 1;
    uint8_t once_based_enabled : 1;
    uint8_t daily_based_enabled : 1;
    uint8_t reserved : 5;
};

struct CycleStaticVars {
    uint32_t pump_check_start_time;
    uint32_t ec_adjust_start_time;
    uint32_t ph_adjust_start_time;
    uint32_t final_check_start_time;
    uint32_t ec_last_sensor_request;
    uint32_t ph_last_sensor_request;
    uint8_t ec_adjustment_attempts;
    uint8_t ph_adjustment_attempts;
    uint8_t initial_sensor_check : 1;
    uint8_t checked_values : 1;
    uint8_t ec_adjustment_started : 1;
    uint8_t ph_adjustment_started : 1;
    uint8_t final_check_started : 1;
    uint8_t values_checked : 1;
    uint8_t reserved : 2;
};

struct MotorTimer {
    uint32_t currentMillis;
    uint32_t intervalMillis;
    uint32_t cycleStartMillis;
    uint32_t lastCycleMillis;
    uint32_t startMillis;
    uint32_t lastPrintTime;
    uint8_t isActive : 1;
    uint8_t init : 1;
    uint8_t reserved : 6;
};

struct IrrigationTimer {
    uint32_t totalRunTime;
    uint32_t lastStartTime;
    uint32_t pausedDuration;
    uint32_t targetDuration;
    uint8_t isPaused : 1;
    uint8_t isActive : 1;
    uint8_t reserved : 6;
};

struct CheckTimer {
    uint32_t lastCheckTime;
    uint32_t checkStartTime;
    uint8_t isRunning : 1;
    uint8_t reserved : 7;
};

struct NutSystemFlags {
    uint8_t isCycle : 1;
    uint8_t pumpRunning : 1;
    uint8_t cycle_started_today : 1;
    uint8_t timeReceived : 1;
    uint8_t scheduleEndRequested : 1;
    uint8_t reserved : 3;
};

struct PulseFlags {
    uint8_t ec_pulse_active : 1;
    uint8_t ph_pulse_active : 1;
    uint8_t ec_valve_state : 1;
    uint8_t ph_valve_state : 1;
    uint8_t reserved : 4;
};

// ============= 전역 변수 선언 =============
extern NutrientSettings nutrientSettings;
extern ScheduleSettings scheduleSettings;
extern CycleStaticVars cycleVars;
extern MotorTimer motorTimer;
extern IrrigationTimer irrigationTimer;
extern CheckTimer phEcCheckTimer;
extern NutSystemFlags nutSystemFlags;
extern PulseFlags pulseFlags;

extern int8_t cycle;
extern CycleStatus cycleStatus;
extern uint8_t currentHour;
extern uint8_t currentMinute;
extern uint8_t currentDay;
extern uint8_t currentMonth;
extern uint16_t currentYear;
extern uint32_t cycle_start_time;
extern uint32_t ec_last_toggle;
extern uint32_t ph_last_toggle;
extern bool manualStartMode;

// ============= 릴레이 제어 함수 선언 (Command_UNO.cpp에서 제공) =============
// 외부에서 제공받는 함수들
extern void setRelay(uint8_t channel, bool state);
extern bool getRelayStatus(uint8_t channel);
extern void allPinsOff();
extern float pH_Value;  // 센서 값
extern float ecValue;   // EC 값 (μS/cm)

// 펌프 제어 함수들 (nutCycle.cpp에서 제공)
void setPumpStatus(bool status);
bool getPumpStatus();

// ============= 함수 선언 =============
// 양액 사이클 메인 함수들
void initNutrientCycle();
void processNutrientCommand(const char* jsonCommand);
void startNewCycle();
void updateCycle();
void checkCycleRestart();

// 관수 타이머 관련 함수들
void initIrrigationTimer();
void startIrrigationTimer();
void pauseIrrigationTimer();
void resumeIrrigationTimer();
void stopIrrigationTimer();
uint32_t getIrrigationElapsedTime();
bool isIrrigationComplete();

// pH/EC 체크 타이머 관련 함수들
void initPhEcCheckTimer();
void startPhEcCheckTimer();
void stopPhEcCheckTimer();
bool isPhEcCheckTime();

// 센서 값 체크 함수들
bool needAdjustPH();
bool needAdjustEC();
bool needDecreasePH();
bool needIncreasePH();
bool needIncreaseEC();
bool needDecreaseEC();

// 펄스 제어 함수들
void startECPulse();
void startPHPulse();
void stopECPulse();
void stopPHPulse();
void updatePulseControl();

// 시간 관련 함수들
bool isCurrentTimeInRange();
int getCurrentTimeInMinutes();
int getTimeInMinutes(int hour, int minute);
void checkDailyReset();

// JSON 처리 헬퍼 함수들
bool parseNutrientSettings(JsonObject& json);
bool parseScheduleSettings(JsonObject& json);

// 유틸리티 함수들
void motorInit(float cycleTime);
bool periodValidation(int startHour, int startMinute, int endHour, int endMinute);
bool intervalValidation(float supplyTime, float cycleTime);

