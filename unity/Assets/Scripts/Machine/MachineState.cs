namespace EDMDigitalTwin.Machine
{
    public enum MachineState
    {
        BOOTING,
        READY,
        WAITING_FOR_PARAMETERS,
        READY_TO_START,
        STARTING,
        POSITIONING_TANK,
        LOWERING_TOOL,
        MACHINING,
        RETRACTING,
        RETURNING_TANK,
        COMPLETED,
        FAULT,
        EMERGENCY_STOP,
        OFFLINE
    }
}
