#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Preferences.h>

#include "toolhead_serial_config_esp32.h"

Servo toolheadServo;
Preferences stateStore;

enum Direction { UP, DOWN, STOPPED };
enum Motion { MOVING, MOTION_STOPPED, MOTION_ERROR };

bool servoArmed = false;

float estimatedPositionMm = MIN_PHYSICAL_POSITION_MM;
float targetPositionMm = MIN_PHYSICAL_POSITION_MM;
float currentServoCommand = SERVO_STOP_ANGLE;
float requestedSpeedMmPerSec = DEFAULT_COMMAND_SPEED_MM_PER_SEC;

Direction currentDirection = STOPPED;
Motion currentMotion = MOTION_STOPPED;
unsigned long motionStartedAt = 0;
unsigned long lastMotionAt = 0;
unsigned long lastControlAt = 0;
unsigned long lastTelemetryAt = 0;
char lastErrorMsg[128] = "";

char incomingLine[2048];
size_t incomingLength = 0;

float clampPosition(float value) {
  return constrain(value, MIN_PHYSICAL_POSITION_MM, MAX_PHYSICAL_POSITION_MM);
}

const char* directionName() {
  return currentDirection == UP ? "UP" : currentDirection == DOWN ? "DOWN" : "STOPPED";
}

const char* motionName() {
  return currentMotion == MOVING ? "MOVING" : currentMotion == MOTION_ERROR ? "ERROR" : "STOPPED";
}

const char* physicalStateName() {
  if (currentMotion == MOTION_ERROR) return "ERROR";
  return currentMotion == MOVING ? "MOVING" : "READY";
}

void publishBootMessage() {
  DynamicJsonDocument doc(512);
  doc["type"] = "toolhead.boot";
  doc["payload"]["controller"] = CONTROLLER_NAME;
  doc["payload"]["chip"] = CHIP_NAME;
  doc["payload"]["protocol"] = PROTOCOL_NAME;
  serializeJson(doc, Serial);
  Serial.println();
}

void publishState(const char* errorMsg = nullptr) {
  DynamicJsonDocument doc(2048);
  doc["type"] = "toolhead.state";

  JsonObject payload = doc.createNestedObject("payload");
  payload["controller"] = CONTROLLER_NAME;
  payload["chip"] = CHIP_NAME;
  payload["protocol"] = PROTOCOL_NAME;
  payload["transport"] = "usb_serial";

  payload["position_mm"] = estimatedPositionMm;
  payload["target_position_mm"] = targetPositionMm;
  payload["min_position_mm"] = MIN_PHYSICAL_POSITION_MM;
  payload["max_position_mm"] = MAX_PHYSICAL_POSITION_MM;
  payload["position_source"] = "servo_estimate";

  payload["servo_angle"] = currentServoCommand;
  payload["servo_direction"] = currentDirection == UP ? -1 : currentDirection == DOWN ? 1 : 0;
  payload["speed_mm_per_sec"] = requestedSpeedMmPerSec;

  payload["direction"] = directionName();
  payload["motion"] = motionName();
  payload["physical_state"] = physicalStateName();
  
  payload["calibrated"] = true; // Open-loop implies no manual calibration needed
  payload["servo_armed"] = servoArmed;

  if (errorMsg) {
    payload["error"] = errorMsg;
    strncpy(lastErrorMsg, errorMsg, sizeof(lastErrorMsg) - 1);
  } else if (strlen(lastErrorMsg) > 0) {
    payload["error"] = lastErrorMsg;
  }

  serializeJson(doc, Serial);
  Serial.println();
  lastTelemetryAt = millis();
}

void safeStop() {
  currentMotion = MOTION_STOPPED;
  currentDirection = STOPPED;
  targetPositionMm = estimatedPositionMm;
  if (servoArmed) {
    currentServoCommand = SERVO_STOP_ANGLE;
    toolheadServo.write(currentServoCommand);
  }
}

void stopWithError(const char* reason) {
  currentMotion = MOTION_ERROR;
  currentDirection = STOPPED;
  targetPositionMm = estimatedPositionMm;
  currentServoCommand = SERVO_STOP_ANGLE;
  if (servoArmed) {
    toolheadServo.write(currentServoCommand);
  }
  publishState(reason);
}

void updateServoSpeed() {
  if (currentMotion != MOVING || !servoArmed) return;

  // Scale the angle offset proportionately up to ESTIMATED_MM_PER_SEC.
  // requestedSpeedMmPerSec is capped at 50, but we constrain the PWM output ratio
  // to a maximum of 1.0 (full speed for the continuous servo).
  float speedRatio = constrain(requestedSpeedMmPerSec / ESTIMATED_MM_PER_SEC, 0.0f, 1.0f);
  
  if (currentDirection == UP) {
    currentServoCommand = SERVO_STOP_ANGLE + speedRatio * (SERVO_UP_ANGLE_MAX - SERVO_STOP_ANGLE);
  } else {
    currentServoCommand = SERVO_STOP_ANGLE + speedRatio * (SERVO_DOWN_ANGLE_MAX - SERVO_STOP_ANGLE);
  }
  toolheadServo.write(currentServoCommand);
}

void setTarget(float requestedPositionMm) {
  if (!servoArmed) {
    publishState("Physical movement is locked until the controller is armed.");
    return;
  }
  if (!isfinite(requestedPositionMm) || requestedPositionMm < MIN_PHYSICAL_POSITION_MM || requestedPositionMm > MAX_PHYSICAL_POSITION_MM) {
    publishState("Requested position is outside the configured physical travel limits.");
    return;
  }
  
  // Clear any previous error
  lastErrorMsg[0] = '\0';
  
  targetPositionMm = requestedPositionMm;
  if (fabs(targetPositionMm - estimatedPositionMm) < 0.5f) {
    safeStop();
    publishState();
    return;
  }
  
  currentDirection = targetPositionMm > estimatedPositionMm ? DOWN : UP;
  currentMotion = MOVING;
  motionStartedAt = millis();
  lastMotionAt = motionStartedAt;
  
  updateServoSpeed();
  
  publishState();
}

void setSpeed(float requestedSpeed) {
  if (!isfinite(requestedSpeed) || requestedSpeed < MIN_REQUESTED_SPEED_MM_PER_SEC || requestedSpeed > MAX_REQUESTED_SPEED_MM_PER_SEC) {
    publishState("Requested speed is outside the 1-50 mm/s limit.");
    return;
  }
  requestedSpeedMmPerSec = requestedSpeed;
  
  // Apply immediately to the running physical motion
  updateServoSpeed();
  
  publishState();
}

void handleCommand(const char* command, JsonObject payload) {
  if (strcmp(command, "PING") == 0 || strcmp(command, "STATUS") == 0 || strcmp(command, "GET_STATE") == 0) publishState();
  else if (strcmp(command, "STOP") == 0) { safeStop(); publishState(); }
  else if (strcmp(command, "UP") == 0 || strcmp(command, "TOP") == 0) setTarget(MIN_PHYSICAL_POSITION_MM);
  else if (strcmp(command, "DOWN") == 0 || strcmp(command, "LOW") == 0) setTarget(MAX_PHYSICAL_POSITION_MM);
  else if (strcmp(command, "MIDDLE") == 0) setTarget((MIN_PHYSICAL_POSITION_MM + MAX_PHYSICAL_POSITION_MM) / 2.0f);
  else if (strcmp(command, "SET_POSITION") == 0 || strcmp(command, "SET POSITION") == 0) {
    if (!payload.containsKey("position_mm")) publishState("position_mm is required.");
    else setTarget(payload["position_mm"].as<float>());
  } else if (strcmp(command, "SET_SPEED") == 0 || strcmp(command, "SET SPEED") == 0) setSpeed(payload["speed_mm_per_sec"] | NAN);
  else publishState("Unsupported toolhead command.");
}

void handleMessage(const char* line) {
  DynamicJsonDocument document(2048);
  if (deserializeJson(document, line)) {
    publishState("Invalid JSON command.");
    return;
  }

  const char* type = document["type"] | "";
  JsonObject payload = document["payload"].as<JsonObject>();
  lastControlAt = millis();
  
  if (strcmp(type, "heartbeat") == 0) return;
  if (strcmp(type, "toolhead.command") == 0) handleCommand(payload["command"] | "", payload);
  else if (strcmp(type, "toolhead.set_position") == 0) {
    if (!payload.containsKey("position_mm")) publishState("position_mm is required.");
    else setTarget(payload["position_mm"].as<float>());
  } else if (strcmp(type, "toolhead.set_speed") == 0) setSpeed(payload["speed_mm_per_sec"] | NAN);
  else if (strcmp(type, "toolhead.calibration") == 0) {
    // Legacy calibration handles.
    const char* action = payload["action"] | "";
    if (strcmp(action, "ARM") == 0) {
      servoArmed = true;
      publishState();
    } else {
      publishState("Calibration is hardcoded for continuous servo mode.");
    }
  }
  else publishState("Unsupported message type.");
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
      publishState("Serial command exceeded the safety buffer — line discarded.");
      continue;
    }
    incomingLine[incomingLength++] = value;
  }
}

void tickMotion() {
  if (currentMotion != MOVING) return;
  
  const unsigned long now = millis();
  if (!servoArmed) {
    stopWithError("Motion authority was lost.");
    return;
  }
  if (now - motionStartedAt > MOTION_TIMEOUT_MS) {
    stopWithError("Motion timeout reached.");
    return;
  }
  if (now - lastControlAt > COMMAND_WATCHDOG_MS) {
    stopWithError("Serial bridge watchdog expired; stopping servo.");
    return;
  }

  const float deltaSeconds = (now - lastMotionAt) / 1000.0f;
  lastMotionAt = now;
  
  // The actual physical speed is bounded by the servo's max RPM.
  float speedRatio = constrain(requestedSpeedMmPerSec / ESTIMATED_MM_PER_SEC, 0.0f, 1.0f);
  float actualSpeedMmPerSec = speedRatio * ESTIMATED_MM_PER_SEC;
  
  float stepMm = actualSpeedMmPerSec * deltaSeconds;
  if (currentDirection == UP) {
    estimatedPositionMm -= stepMm;
  } else {
    estimatedPositionMm += stepMm;
  }
  
  // Guard against overshoot
  if (currentDirection == UP && estimatedPositionMm <= targetPositionMm) {
    estimatedPositionMm = targetPositionMm;
    safeStop();
  } else if (currentDirection == DOWN && estimatedPositionMm >= targetPositionMm) {
    estimatedPositionMm = targetPositionMm;
    safeStop();
  }
  
  estimatedPositionMm = clampPosition(estimatedPositionMm);
}

void setup() {
  Serial.setRxBufferSize(2048);
  Serial.setTxBufferSize(2048);
  Serial.begin(SERIAL_BAUD_RATE);
  delay(100);
  publishBootMessage();
  
  toolheadServo.setPeriodHertz(50);
  toolheadServo.attach(SERVO_PWM_PIN, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
  currentServoCommand = SERVO_STOP_ANGLE;
  toolheadServo.write(currentServoCommand);
  servoArmed = true; // Auto-arm for precalibrated setup

  // Read saved estimated position if it exists, otherwise assume 0.
  stateStore.begin("toolhead", false);
  estimatedPositionMm = stateStore.getFloat("last_pos", MIN_PHYSICAL_POSITION_MM);
  targetPositionMm = estimatedPositionMm;

  lastControlAt = millis();
  publishState();
}

void loop() {
  readSerial();
  tickMotion();

  unsigned long now = millis();
  if (now - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
    publishState();
    
    // Periodically save position to NVS
    static unsigned long lastSaveAt = 0;
    if (now - lastSaveAt > 5000 && currentMotion == MOTION_STOPPED) {
      stateStore.putFloat("last_pos", estimatedPositionMm);
      lastSaveAt = now;
    }
  }
}
