#pragma once

// Copy this file only after measuring the physical mechanism. The checked-in
// defaults deliberately keep physical motion disabled.
#define TOOLHEAD_CONFIGURATION_COMPLETE false

constexpr char WIFI_SSID[] = "REPLACE_WITH_WIFI_SSID";
constexpr char WIFI_PASSWORD[] = "REPLACE_WITH_WIFI_PASSWORD";
constexpr char GATEWAY_HOST[] = "192.168.1.100"; // Replace with the LAN gateway address.
constexpr uint16_t GATEWAY_PORT = 8080;
constexpr char GATEWAY_PATH[] = "/?role=esp32";

constexpr int SERVO_PWM_PIN = -1; // Set only after wiring verification.
constexpr float MIN_POSITION_MM = 0.0f;
constexpr float MAX_POSITION_MM = 0.0f; // Must be greater than MIN_POSITION_MM.
constexpr float SERVO_MIN_DEG = 0.0f;
constexpr float SERVO_MAX_DEG = 0.0f;
constexpr float MAX_TRAVEL_SPEED_MM_PER_SEC = 0.0f;
constexpr uint32_t MOTION_TIMEOUT_MS = 0;

// Use a physical linear/rotary feedback channel when available. A hobby-servo
// command alone is an estimate and cannot confirm the actual toolhead position.
constexpr bool HAS_POSITION_FEEDBACK = false;
constexpr int POSITION_FEEDBACK_PIN = -1;
constexpr int FEEDBACK_MIN_RAW = 0;
constexpr int FEEDBACK_MAX_RAW = 0;
