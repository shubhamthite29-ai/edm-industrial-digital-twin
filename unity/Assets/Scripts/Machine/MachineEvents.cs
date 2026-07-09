using System;

namespace EDMDigitalTwin.Machine
{
    public static class MachineEvents
    {
        public static event Action<MachineParameters> ParameterChanged;
        public static event Action<MachineState> StateChanged;
        public static event Action MachineStarted;
        public static event Action MachineFinished;
        public static event Action SparkStarted;
        public static event Action SparkStopped;

        public static void RaiseParameterChanged(MachineParameters parameters) => ParameterChanged?.Invoke(parameters);
        public static void RaiseStateChanged(MachineState state) => StateChanged?.Invoke(state);
        public static void RaiseMachineStarted() => MachineStarted?.Invoke();
        public static void RaiseMachineFinished() => MachineFinished?.Invoke();
        public static void RaiseSparkStarted() => SparkStarted?.Invoke();
        public static void RaiseSparkStopped() => SparkStopped?.Invoke();
    }
}
