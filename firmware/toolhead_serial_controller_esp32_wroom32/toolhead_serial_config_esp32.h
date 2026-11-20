#pragma once

// ESP32-WROOM-32 / ESP32-D0WD-V3, selected as ESP32 Dev Module.
constexpr char CONTROLLER_NAME[] = "ESP32-WROOM-32";
constexpr char CHIP_NAME[] = "ESP32-D0WD-V3";
constexpr char PROTOCOL_NAME[] = "toolhead-json";
constexpr unsigned long SERIAL_BAUD_RATE = 115200;

// GPIO18 is not assigned elsewhere in this project and is a standard ESP32
// LEDC-capable output. Connect only the MG996R signal lead here.
constexpr int SERVO_PWM_PIN = 18;
constexpr int SERVO_MIN_PULSE_US = 500;
constexpr int SERVO_MAX_PULSE_US = 2500;

// ---------------------------------------------------------------------------
// Continuous Rotation Servo Configuration
// ---------------------------------------------------------------------------
// Based on reference code, this MG996R is modified for continuous rotation.
constexpr float SERVO_STOP_ANGLE = 90.0f;
// Reversed based on physical test: 75 moves UP, 105 moves DOWN.
// These represent the maximum speed angles for continuous rotation.
constexpr float SERVO_UP_ANGLE_MAX = 75.0f;
constexpr float SERVO_DOWN_ANGLE_MAX = 105.0f;

// ---------------------------------------------------------------------------
// Physical limits and speed mapping
// ---------------------------------------------------------------------------
// The rack is 220mm long. We restrict travel to a safe 50mm bound (reduced from 100mm).
constexpr float MIN_PHYSICAL_POSITION_MM = 0.0f;
constexpr float MAX_PHYSICAL_POSITION_MM = 50.0f;

// To map time to distance, we estimate the mm/s travel speed at the given servo speeds.
// With 28T, 1mm module -> 87.9mm/rev. At 700ms/rev (from reference) -> ~125 mm/s.
// To be conservative and allow control, we assume the physical toolhead moves at ~15 mm/s.
constexpr float ESTIMATED_MM_PER_SEC = 15.0f;

constexpr float DEFAULT_COMMAND_SPEED_MM_PER_SEC = ESTIMATED_MM_PER_SEC;
constexpr float MIN_REQUESTED_SPEED_MM_PER_SEC = 1.0f;
constexpr float MAX_REQUESTED_SPEED_MM_PER_SEC = 50.0f;

constexpr unsigned long MOTION_TIMEOUT_MS = 30000;
constexpr unsigned long COMMAND_WATCHDOG_MS = 2000;
constexpr unsigned long TELEMETRY_INTERVAL_MS = 100;
