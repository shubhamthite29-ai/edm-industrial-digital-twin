# ESP32 Toolhead Controller

This controller is intentionally **locked** until the physical build is measured and wired. It uses the same WebSocket state schema as the dashboard and gateway; it does not accept browser commands outside the configured travel.

## Required Arduino libraries

- `ArduinoJson`
- `arduinoWebSockets` (`WebSocketsClient`)
- `ESP32Servo`

## Required values before enabling physical motion

Edit `toolhead_config.h` after confirming the mechanism and emergency-safe direction:

1. `SERVO_PWM_PIN`
2. `GATEWAY_HOST`, Wi-Fi credentials, and the ESP32's power/network arrangement
3. `MIN_POSITION_MM` and `MAX_POSITION_MM`, measured at mechanical end stops
4. `SERVO_MIN_DEG` and `SERVO_MAX_DEG`, measured without driving into the stops
5. `MAX_TRAVEL_SPEED_MM_PER_SEC` and a conservative `MOTION_TIMEOUT_MS`
6. Optional analog position-feedback pin and its calibrated raw endpoints
7. Set `TOOLHEAD_CONFIGURATION_COMPLETE` to `true` only after all checks pass

Without position feedback, the returned `position_mm` has `position_source: "servo_estimate"`; it is a commanded-position estimate, not proof of actual mechanical position. A feedback sensor is required for measured physical/digital synchronization.

## Commands received

```json
{"type":"toolhead.command","payload":{"command":"UP"}}
{"type":"toolhead.command","payload":{"command":"DOWN"}}
{"type":"toolhead.command","payload":{"command":"STOP"}}
{"type":"toolhead.set_position","payload":{"position_mm":42.5}}
{"type":"toolhead.set_speed","payload":{"speed_mm_per_sec":10}}
```

## State transmitted

```json
{"type":"toolhead.state","payload":{"position_mm":42.5,"target_position_mm":42.5,"servo_angle":65.0,"direction":"STOPPED","motion":"STOPPED","position_source":"linear_feedback","calibrated":true}}
```

On gateway disconnect, malformed command, timeout, calibration failure, or an out-of-range setpoint, the firmware stops changing the servo setpoint and reports an error when the gateway is available again.

Canonical direction is always preserved: `UP` targets `MIN_POSITION_MM` (the dashboard's 0 mm / TOP state), while `DOWN` targets `MAX_POSITION_MM` (100 mm / LOW). `toolhead.set_speed` is rejected when it exceeds the measured `MAX_TRAVEL_SPEED_MM_PER_SEC`.
