namespace EDMDigitalTwin.Machine
{
    public enum MachineState
    {
        READY,
        STARTING,
        MACHINING,
        PAUSED,
        STOPPED,
        HOMING,
        RESETTING,
        EMERGENCY_STOP
    }
}
