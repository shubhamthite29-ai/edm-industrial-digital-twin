#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

#include "toolhead_config.h"

WebSocketsClient gateway;
Servo toolheadServo;

enum Direction { UP, DOWN, STOPPED };
enum Motion { MOVING, MOTION_STOPPED, MOTION_ERROR };

bool gatewayConnected = false;
bool servoAttached = false;
float commandedPositionMm = MIN_POSITION_MM;
float targetPositionMm = MIN_POSITION_MM;
float servoAngleDeg = SERVO_MIN_DEG;
float commandedSpeedMmPerSec = MAX_TRAVEL_SPEED_MM_PER_SEC;
Direction direction = STOPPED;
Motion motion = MOTION_STOPPED;
uint32_t motionStartedAt = 0;
uint32_t lastMotionAt = 0;
uint32_t lastTelemetryAt = 0;

bool calibrationConfigured() {
  return TOOLHEAD_CONFIGURATION_COMPLETE && SERVO_PWM_PIN >= 0 &&
    MAX_POSITION_MM > MIN_POSITION_MM && SERVO_MAX_DEG > SERVO_MIN_DEG &&
    MAX_TRAVEL_SPEED_MM_PER_SEC > 0 && MOTION_TIMEOUT_MS > 0;
}

float clampPosition(float positionMm) { return constrain(positionMm, MIN_POSITION_MM, MAX_POSITION_MM); }

float positionToServoAngle(float positionMm) {
  const float ratio = (clampPosition(positionMm) - MIN_POSITION_MM) / (MAX_POSITION_MM - MIN_POSITION_MM);
  return SERVO_MIN_DEG + ratio * (SERVO_MAX_DEG - SERVO_MIN_DEG);
}

float readPhysicalPositionMm() {
  if (!HAS_POSITION_FEEDBACK || POSITION_FEEDBACK_PIN < 0 || FEEDBACK_MAX_RAW <= FEEDBACK_MIN_RAW) return commandedPositionMm;
  const int raw = analogRead(POSITION_FEEDBACK_PIN);
  const float ratio = constrain((raw - FEEDBACK_MIN_RAW) / float(FEEDBACK_MAX_RAW - FEEDBACK_MIN_RAW), 0.0f, 1.0f);
  return MIN_POSITION_MM + ratio * (MAX_POSITION_MM - MIN_POSITION_MM);
}

const char* positionSource() { return HAS_POSITION_FEEDBACK ? "linear_feedback" : "servo_estimate"; }
const char* directionName() { return direction == UP ? "UP" : direction == DOWN ? "DOWN" : "STOPPED"; }
const char* motionName() { return motion == MOVING ? "MOVING" : motion == MOTION_ERROR ? "ERROR" : "STOPPED"; }

void safeStop(const char* reason = nullptr) {
  targetPositionMm = readPhysicalPositionMm();
  commandedPositionMm = targetPositionMm;
  direction = STOPPED;
  motion = reason == nullptr ? MOTION_STOPPED : MOTION_ERROR;
  servoAngleDeg = positionToServoAngle(commandedPositionMm);
  if (servoAttached) toolheadServo.write(round(servoAngleDeg));
}

void publishState(const char* error = nullptr) {
  if (!gatewayConnected) return;
  StaticJsonDocument<512> document;
  document["type"] = "toolhead.state";
  JsonObject payload = document.createNestedObject("payload");
  payload["position_mm"] = readPhysicalPositionMm();
  payload["target_position_mm"] = targetPositionMm;
  payload["servo_angle"] = servoAngleDeg;
  payload["speed_mm_per_sec"] = commandedSpeedMmPerSec;
  payload["direction"] = directionName();
  payload["motion"] = motionName();
  payload["position_source"] = positionSource();
  payload["calibrated"] = calibrationConfigured();
  payload["min_position_mm"] = MIN_POSITION_MM;
  payload["max_position_mm"] = MAX_POSITION_MM;
  payload["servo_min_deg"] = SERVO_MIN_DEG;
  payload["servo_max_deg"] = SERVO_MAX_DEG;
  if (error != nullptr) payload["error"] = error;
  String message;
  serializeJson(document, message);
  gateway.sendTXT(message);
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
  if (fabs(targetPositionMm - current) < 0.01f) { safeStop(); publishState(); return; }
  // Canonical position increases from TOP (0 mm) toward LOW (100 mm).
  direction = targetPositionMm > current ? DOWN : UP;
  motion = MOVING;
  motionStartedAt = millis();
  lastMotionAt = motionStartedAt;
}

void handleGatewayMessage(uint8_t* bytes, size_t length) {
  StaticJsonDocument<512> document;
  if (deserializeJson(document, bytes, length)) { publishState("Invalid JSON command."); return; }
  const char* type = document["type"] | "";
  JsonObject payload = document["payload"].as<JsonObject>();
  if (strcmp(type, "toolhead.command") == 0) {
    const char* command = payload["command"] | "";
    if (strcmp(command, "UP") == 0) setTarget(MIN_POSITION_MM);
    else if (strcmp(command, "DOWN") == 0) setTarget(MAX_POSITION_MM);
    else if (strcmp(command, "STOP") == 0) { safeStop(); publishState(); }
    else publishState("Unsupported toolhead command.");
    return;
  }
  if (strcmp(type, "toolhead.set_position") == 0) {
    if (!payload.containsKey("position_mm")) publishState("position_mm is required.");
    else setTarget(payload["position_mm"].as<float>());
    return;
  }
  if (strcmp(type, "toolhead.set_speed") == 0) {
    const float requestedSpeed = payload["speed_mm_per_sec"] | NAN;
    if (!isfinite(requestedSpeed) || requestedSpeed <= 0 || requestedSpeed > MAX_TRAVEL_SPEED_MM_PER_SEC) {
      publishState("Requested speed is outside configured physical limits.");
      return;
    }
    commandedSpeedMmPerSec = requestedSpeed;
    publishState();
  }
}

void gatewayEvent(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_CONNECTED) {
    gatewayConnected = true;
    gateway.sendTXT("{\"type\":\"client.hello\",\"payload\":{\"role\":\"esp32\"}}");
    publishState();
  } else if (type == WStype_DISCONNECTED) {
    gatewayConnected = false;
    safeStop("Gateway connection lost.");
  } else if (type == WStype_TEXT) {
    handleGatewayMessage(payload, length);
  }
}

void tickMotion() {
  if (motion != MOVING) return;
  const uint32_t now = millis();
  if (now - motionStartedAt > MOTION_TIMEOUT_MS) { safeStop("Motion timeout reached."); publishState("Motion timeout reached."); return; }
  const float deltaSeconds = (now - lastMotionAt) / 1000.0f;
  lastMotionAt = now;
  const float next = commandedPositionMm + (direction == DOWN ? 1.0f : -1.0f) * commandedSpeedMmPerSec * deltaSeconds;
  const bool reached = direction == DOWN ? next >= targetPositionMm : next <= targetPositionMm;
  commandedPositionMm = reached ? targetPositionMm : next;
  servoAngleDeg = positionToServoAngle(commandedPositionMm);
  toolheadServo.write(round(servoAngleDeg));
  if (reached) safeStop();
}

void setup() {
  Serial.begin(115200);
  if (calibrationConfigured()) {
    toolheadServo.setPeriodHertz(50);
    toolheadServo.attach(SERVO_PWM_PIN, 500, 2500);
    servoAttached = true;
    servoAngleDeg = positionToServoAngle(commandedPositionMm);
    toolheadServo.write(round(servoAngleDeg));
  }
  if (HAS_POSITION_FEEDBACK && POSITION_FEEDBACK_PIN >= 0) pinMode(POSITION_FEEDBACK_PIN, INPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  gateway.begin(GATEWAY_HOST, GATEWAY_PORT, GATEWAY_PATH);
  gateway.onEvent(gatewayEvent);
  gateway.setReconnectInterval(3000);
}

void loop() {
  gateway.loop();
  tickMotion();
  if (gatewayConnected && millis() - lastTelemetryAt >= 100) { lastTelemetryAt = millis(); publishState(); }
}
