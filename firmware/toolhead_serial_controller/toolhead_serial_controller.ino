#include <ArduinoJson.h>
#include <ArduinoJson.hpp>

#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "toolhead_serial_config.h"

#include <ArduinoJson.h>
#include <ESP32Servo.h>

#include "toolhead_serial_config.h"

Servo toolheadServo;

enum Direction { UP, DOWN, STOPPED };
enum Motion { MOVING, MOTION_STOPPED, MOTION_ERROR };

bool servoAttached = false;
float commandedPositionMm = MIN_POSITION_MM;
float targetPositionMm = MIN_POSITION_MM;
float servoAngleDeg = SERVO_TOP_ANGLE;
float commandedSpeedMmPerSec = MAX_TRAVEL_SPEED_MM_PER_SEC;
Direction direction = STOPPED;
Motion motion = MOTION_STOPPED;
unsigned long motionStartedAt = 0;
unsigned long lastMotionAt = 0;
unsigned long lastControlAt = 0;
unsigned long lastTelemetryAt = 0;

char incomingLine[512];
size_t incomingLength = 0;

bool calibrationConfigured() {
  return TOOLHEAD_CONFIGURATION_COMPLETE && SERVO_PWM_PIN >= 0 &&
    MAX_POSITION_MM > MIN_POSITION_MM && MAX_TRAVEL_SPEED_MM_PER_SEC >= 1 && MAX_TRAVEL_SPEED_MM_PER_SEC <= 50 &&
    MOTION_TIMEOUT_MS > 0 && COMMAND_WATCHDOG_MS > 0 &&
    isfinite(SERVO_TOP_ANGLE) && isfinite(SERVO_LOW_ANGLE) &&
    SERVO_TOP_ANGLE >= 0 && SERVO_TOP_ANGLE <= 180 &&
    SERVO_LOW_ANGLE >= 0 && SERVO_LOW_ANGLE <= 180;
}

float clampPosition(float value) {
  return constrain(value, MIN_POSITION_MM, MAX_POSITION_MM);
}

float positionToServoAngle(float positionMm) {
  const float ratio = (clampPosition(positionMm) - MIN_POSITION_MM) /
    (MAX_POSITION_MM - MIN_POSITION_MM);
  return SERVO_TOP_ANGLE + ratio * (SERVO_LOW_ANGLE - SERVO_TOP_ANGLE);
}

float readPhysicalPositionMm() {
  if (!HAS_POSITION_FEEDBACK || POSITION_FEEDBACK_PIN < 0 || FEEDBACK_TOP_RAW == FEEDBACK_LOW_RAW) {
    return commandedPositionMm;
  }

  const int raw = analogRead(POSITION_FEEDBACK_PIN);
  const float ratio = constrain((raw - FEEDBACK_TOP_RAW) /
    float(FEEDBACK_LOW_RAW - FEEDBACK_TOP_RAW), 0.0f, 1.0f);
  return MIN_POSITION_MM + ratio * (MAX_POSITION_MM - MIN_POSITION_MM);
}

const char* directionName() {
  return direction == UP ? "UP" : direction == DOWN ? "DOWN" : "STOPPED";
}

const char* motionName() {
  return motion == MOVING ? "MOVING" : motion == MOTION_ERROR ? "ERROR" : "STOPPED";
}

const char* positionSource() {
  return HAS_POSITION_FEEDBACK ? "linear_feedback" : "servo_estimate";
}

void publishState(const char* error = nullptr) {
  StaticJsonDocument<512> document;
  document["type"] = "toolhead.state";
  JsonObject payload = document.createNestedObject("payload");
  payload["position_mm"] = readPhysicalPositionMm();
  payload["target_position_mm"] = targetPositionMm;
  payload["speed_mm_per_sec"] = commandedSpeedMmPerSec;
  payload["controller"] = CONTROLLER_NAME;
  payload["physical_state"] = calibrationConfigured()
    ? (motion == MOVING ? "MOVING" : motion == MOTION_ERROR ? "ERROR" : "STOPPED")
    : "CALIBRATION_REQUIRED";
  payload["servo_angle"] = servoAngleDeg;
  payload["direction"] = directionName();
  payload["motion"] = motionName();
  payload["position_source"] = positionSource();
  payload["calibrated"] = calibrationConfigured();
  payload["min_position_mm"] = MIN_POSITION_MM;
  payload["max_position_mm"] = MAX_POSITION_MM;
  payload["servo_min_deg"] = min(SERVO_TOP_ANGLE, SERVO_LOW_ANGLE);
  payload["servo_max_deg"] = max(SERVO_TOP_ANGLE, SERVO_LOW_ANGLE);
  if (error != nullptr) payload["error"] = error;
  serializeJson(document, Serial);
  Serial.println();
}

void safeStop(const char* reason = nullptr) {
  targetPositionMm = readPhysicalPositionMm();
  commandedPositionMm = targetPositionMm;
  direction = STOPPED;
  motion = reason == nullptr ? MOTION_STOPPED : MOTION_ERROR;
  servoAngleDeg = positionToServoAngle(commandedPositionMm);
  if (servoAttached) toolheadServo.write(round(servoAngleDeg));
}

void setTarget(float requestedPositionMm) {
  if (!calibrationConfigured()) {
    safeStop("Calibration or servo configuration is incomplete.");
    publishState("Calibration or servo configuration is incomplete.");
    return;
  }
  if (!isfinite(requestedPositionMm) || requestedPositionMm < MIN_POSITION_MM || requestedPositionMm > MAX_POSITION_MM) {
    safeStop("Requested position is outside configured travel.");
    publishState("Requested position is outside configured travel.");
    return;
  }

  targetPositionMm = requestedPositionMm;
  const float current = readPhysicalPositionMm();
  if (fabs(targetPositionMm - current) < 0.01f) {
    safeStop();
    publishState();
    return;
  }

  direction = targetPositionMm > current ? DOWN : UP;
  motion = MOVING;
  motionStartedAt = millis();
  lastMotionAt = motionStartedAt;
}

void setSpeed(float requestedSpeedMmPerSec) {
  if (!calibrationConfigured() || !isfinite(requestedSpeedMmPerSec) ||
      requestedSpeedMmPerSec <= 0 || requestedSpeedMmPerSec > MAX_TRAVEL_SPEED_MM_PER_SEC) {
    publishState("Requested speed is outside configured physical limits.");
    return;
  }
  commandedSpeedMmPerSec = requestedSpeedMmPerSec;
  publishState();
}

void handleMessage(const char* line) {
  StaticJsonDocument<512> document;
  if (deserializeJson(document, line)) {
    publishState("Invalid JSON command.");
    return;
  }

  const char* type = document["type"] | "";
  JsonObject payload = document["payload"].as<JsonObject>();
  lastControlAt = millis();

  if (strcmp(type, "heartbeat") == 0) return;
  if (strcmp(type, "toolhead.command") == 0) {
    const char* command = payload["command"] | "";
    if (strcmp(command, "UP") == 0) setTarget(MIN_POSITION_MM);
    else if (strcmp(command, "DOWN") == 0) setTarget(MAX_POSITION_MM);
    else if (strcmp(command, "STOP") == 0) { safeStop(); publishState(); }
    else if (strcmp(command, "GET_STATE") == 0 || strcmp(command, "STATUS") == 0 || strcmp(command, "PING") == 0) publishState();
    else publishState("Unsupported toolhead command.");
    return;
  }
  if (strcmp(type, "toolhead.set_position") == 0) {
    if (!payload.containsKey("position_mm")) publishState("position_mm is required.");
    else setTarget(payload["position_mm"].as<float>());
    return;
  }
  if (strcmp(type, "toolhead.set_speed") == 0) {
    setSpeed(payload["speed_mm_per_sec"] | NAN);
    return;
  }
  publishState("Unsupported message type.");
}

void readSerial() {
  while (Serial.available() > 0) {
    const char value = static_cast<char>(Serial.read());
    if (value == '\r') continue;
    if (value == '\n') {
      incomingLine[incomingLength] = '\0';
      if (incomingLength > 0) handleMessage(incomingLine);
      incomingLength = 0;
      continue;
    }
    if (incomingLength >= sizeof(incomingLine) - 1) {
      incomingLength = 0;
      safeStop("Serial command exceeded the safety buffer.");
      publishState("Serial command exceeded the safety buffer.");
      continue;
    }
    incomingLine[incomingLength++] = value;
  }
}

void tickMotion() {
  if (motion != MOVING) return;
  const unsigned long now = millis();
  if (now - motionStartedAt > MOTION_TIMEOUT_MS) {
    safeStop("Motion timeout reached.");
    publishState("Motion timeout reached.");
    return;
  }
  if (now - lastControlAt > COMMAND_WATCHDOG_MS) {
    safeStop("Serial bridge watchdog expired.");
    publishState("Serial bridge watchdog expired.");
    return;
  }

  const float deltaSeconds = (now - lastMotionAt) / 1000.0f;
  lastMotionAt = now;
  const float next = commandedPositionMm + (direction == DOWN ? 1.0f : -1.0f) *
    commandedSpeedMmPerSec * deltaSeconds;
  const bool reached = direction == DOWN ? next >= targetPositionMm : next <= targetPositionMm;
  commandedPositionMm = reached ? targetPositionMm : next;
  servoAngleDeg = positionToServoAngle(commandedPositionMm);
  if (servoAttached) toolheadServo.write(round(servoAngleDeg));
  if (reached) safeStop();
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  lastControlAt = millis();
  if (calibrationConfigured()) {
    toolheadServo.attach(SERVO_PWM_PIN);
    servoAttached = true;
    safeStop();
  }
  if (HAS_POSITION_FEEDBACK && POSITION_FEEDBACK_PIN >= 0) pinMode(POSITION_FEEDBACK_PIN, INPUT);
  publishState(calibrationConfigured() ? nullptr : "Physical motion is locked pending configuration.");
}

void loop() {
  readSerial();
  tickMotion();
  if (millis() - lastTelemetryAt >= 100) {
    lastTelemetryAt = millis();
    publishState();
  }
}
