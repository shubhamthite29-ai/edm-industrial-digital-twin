EDM Digital Twin Unity Scripts v1.0.2

Copy/replace the complete Assets/Scripts folder.

Do not copy only MachineManager.cs.

MachineState.cs must be replaced too. It contains:

READY
STARTING
MACHINING
PAUSED
STOPPED
HOMING
RESETTING
EMERGENCY_STOP

If Unity still reports that PAUSED or STOPPED does not exist, an older MachineState.cs is still present somewhere in Assets. Search the Unity project for "enum MachineState" and remove or replace the old file.
