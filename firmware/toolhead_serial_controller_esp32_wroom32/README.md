# ESP32-WROOM-32 Toolhead Controller

Upload `toolhead_serial_controller_esp32_wroom32.ino` to the physical
**ESP32-WROOM-32 / ESP32-D0WD-V3** using the Arduino IDE **ESP32 Dev Module**
profile and `COM6` at 115200 baud.

## Dependencies

- `ArduinoJson`
- `ESP32Servo`

The firmware sends these boot diagnostics after every reset:

```text
TOOLHEAD_FIRMWARE_BOOT
controller=ESP32-WROOM-32
chip=ESP32-D0WD-V3
protocol=toolhead-json
baud=115200
```

It then emits newline-delimited `toolhead.state` JSON at 10 Hz and answers the
existing `PING`, `STATUS`, and `GET_STATE` messages. Telemetry identifies
position as `servo_estimate`; it is not measured rack displacement.

## Safety lock

GPIO18 is reserved for the MG996R signal, but the calibration session is
deliberately disabled and all calibration angles are unset. The board will not
attach or move a servo, but it will communicate and report
`CALIBRATION_REQUIRED`.

The MG996R must use a suitable external servo supply. Do not power it from
ESP32 3.3 V or USB. Connect the external supply ground to ESP32 GND, and connect
only the servo signal lead to GPIO18.

Before enabling a calibration session, mechanically verify a harmless initial
servo angle and a narrow emergency angle window, then set
`CALIBRATION_SESSION_ENABLED`, `CALIBRATION_INITIAL_SAFE_ANGLE_DEG`,
`MIN_SAFE_SERVO_ANGLE_DEG`, and `MAX_SAFE_SERVO_ANGLE_DEG` in the config and
upload again. No angle is inferred by this sketch.

The dashboard workflow is: **Begin**, move only one degree at a time, inspect,
**Mark TOP**, move in small steps to exactly 100 mm safe rack travel, **Mark
LOW**, then **Commit measured travel**. The controller persists the two angles
and derives the required `servo_direction` from their order. On a future boot,
it remains unarmed until the operator explicitly arms it at its last saved safe
angle. Normal TOP/MIDDLE/LOW controls cannot move the servo before that point.

Close Arduino Serial Monitor before running the Node serial bridge; only one
program can own `COM6` at a time.
