# Toolhead Serial Controller

This firmware is for an Arduino-compatible controller connected to the PC by USB serial. It implements the same Toolhead message types as the React dashboard and gateway, but it is **motion-locked by default**.

## Required libraries

- `ArduinoJson`
- `ESP32Servo` (Arduino Nano ESP32 / ESP32-S3 compatible)

## Arduino Nano ESP32 setup

1. In Arduino IDE, install the official **esp32 by Espressif Systems** board platform.
2. Install `ArduinoJson` and `ESP32Servo` through Library Manager.
3. Select **Arduino Nano ESP32** and the detected `COM6` port.
4. Open `toolhead_serial_controller.ino` and leave `TOOLHEAD_CONFIGURATION_COMPLETE` as `false` for the first upload. In this locked state the firmware can answer `PING` and `GET_STATE`, but never attaches or moves the servo.
5. Upload only after confirming that no other serial monitor or bridge process has COM6 open.
6. Start the gateway, then start the serial bridge with `TOOLHEAD_SERIAL_PORT=COM6`. Confirm that the dashboard reports `Arduino Nano ESP32`, `COM6`, and `CALIBRATION_REQUIRED` before configuring motion.

## Before upload

Edit `toolhead_serial_config.h`. Do not set `TOOLHEAD_CONFIGURATION_COMPLETE` to `true` until all of these values have been measured on the physical mechanism:

1. Board signal pin for `SERVO_PWM_PIN`.
2. `MIN_POSITION_MM` and `MAX_POSITION_MM` from safe physical travel.
3. `SERVO_TOP_ANGLE` and `SERVO_LOW_ANGLE`, verified without driving into mechanical stops.
4. Conservative `MAX_TRAVEL_SPEED_MM_PER_SEC`, `MOTION_TIMEOUT_MS`, and `COMMAND_WATCHDOG_MS`.
5. Optional position-feedback wiring and raw endpoints.

The board accepts newline-delimited JSON, for example:

```json
{"type":"toolhead.command","payload":{"command":"DOWN"}}
{"type":"toolhead.set_position","payload":{"position_mm":50}}
{"type":"toolhead.set_speed","payload":{"speed_mm_per_sec":10}}
```

It transmits `toolhead.state` at 10 Hz. With no position sensor, `position_source` is `servo_estimate`; this is not measured feedback.

`PING`, `STATUS`, and `GET_STATE` are accepted through `toolhead.command` and are safe while calibration is incomplete. They return controller identity, position-source classification, target/current state, and `physical_state: "CALIBRATION_REQUIRED"` until the configuration is complete.

## Safety

- `STOP`, invalid input, command-buffer overflow, motion timeout, and bridge-watchdog expiry halt target progression and hold the current commanded angle.
- The firmware rejects out-of-range positions and speeds.
- The serial bridge sends heartbeat messages while it is operating. If it stops, the firmware watchdog halts a moving mechanism.
- Use an external servo power supply sized for the servo. Connect the controller and supply grounds together. Do not power a mechanical-load servo from a computer USB port.
