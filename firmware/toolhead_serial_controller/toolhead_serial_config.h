#pragma once

// Keep false until the board, wiring, linkage direction, and both mechanical
// end positions have been measured. The firmware will not attach the servo
// while this remains false.
#define TOOLHEAD_CONFIGURATION_COMPLETE false

constexpr char CONTROLLER_NAME[] = "Arduino Nano ESP32";
constexpr unsigned long SERIAL_BAUD_RATE = 115200;
constexpr int SERVO_PWM_PIN = -1;  // Enter only after confirming the signal pin.

// Canonical dashboard position: 0 mm = TOP, 100 mm = LOW. Enter the measured
// physical travel; no values are assumed by this template.
constexpr float MIN_POSITION_MM = 0.0f;
constexpr float MAX_POSITION_MM = 0.0f;

// Measured safe servo angles for the physical TOP and LOW positions. Values
// may increase or decrease with travel, so no separate inversion flag is used.
constexpr float SERVO_TOP_ANGLE = 0.0f;
constexpr float SERVO_LOW_ANGLE = 0.0f;
constexpr float MAX_TRAVEL_SPEED_MM_PER_SEC = 0.0f;
constexpr unsigned long MOTION_TIMEOUT_MS = 0;
constexpr unsigned long COMMAND_WATCHDOG_MS = 0;

// Optional measured position feedback. Without it, telemetry is explicitly
// reported as servo_estimate rather than pretending to be actual position.
constexpr bool HAS_POSITION_FEEDBACK = false;
constexpr int POSITION_FEEDBACK_PIN = -1;
constexpr int FEEDBACK_TOP_RAW = 0;
constexpr int FEEDBACK_LOW_RAW = 0;
