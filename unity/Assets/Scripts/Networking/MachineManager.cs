using System.Collections;
using System.Reflection;
using EDMDigitalTwin.Machine;
using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        [Tooltip("Assign your existing Machinecontroller/MachineController component here.")]
        public MonoBehaviour machineController;

        [SerializeField] private WebSocketClient webSocketClient;
        [SerializeField] private MachineParameterManager parameterManager;
        [SerializeField] private MachineTelemetryPublisher telemetryPublisher;
        [SerializeField] private MachineState currentState = MachineState.READY;
        [SerializeField] private float nominalDepthMm = 18f;

        private Coroutine machiningCoroutine;
        private float elapsedTimeSeconds;
        private float remainingTimeSeconds;
        private float progressPercent;

        public bool IsRunning { get; private set; }
        public bool IsPaused { get; private set; }
        public MachineState CurrentState => currentState;

        private void Awake()
        {
            if (webSocketClient == null) webSocketClient = FindFirstObjectByType<WebSocketClient>();
            if (parameterManager == null) parameterManager = FindFirstObjectByType<MachineParameterManager>();
            if (telemetryPublisher == null) telemetryPublisher = FindFirstObjectByType<MachineTelemetryPublisher>();
        }

        public void StartMachining()
        {
            if (currentState == MachineState.EMERGENCY_STOP)
            {
                Debug.LogWarning("Start command ignored because machine is in EMERGENCY_STOP. Reset before starting.");
                return;
            }

            if (machiningCoroutine != null)
            {
                Debug.Log("Start command ignored because continuous machining is already active.");
                return;
            }

            IsRunning = true;
            IsPaused = false;
            elapsedTimeSeconds = 0f;
            progressPercent = 0f;

            SetMachineState(MachineState.STARTING);
            InvokeControllerMethod("StartMachining", required: false);
            machiningCoroutine = StartCoroutine(ContinuousMachiningLoop());
            Debug.Log("Continuous EDM machining started.");
        }

        public void StopMachining()
        {
            StopContinuousMachining();
            SetMachineState(MachineState.STOPPED);
            InvokeControllerMethod("StopMachining", required: false);
            Debug.Log("Machine cycle stopped safely.");
        }

        public void ResetMachine()
        {
            StopContinuousMachining();
            elapsedTimeSeconds = 0f;
            progressPercent = 0f;
            remainingTimeSeconds = EstimateCycleDurationSeconds(GetParameters());
            SetMachineState(MachineState.RESETTING);
            InvokeControllerMethod("ResetMachine", required: false);
            PublishRuntime(false);
            SetMachineState(MachineState.READY);
            Debug.Log("Machine reset complete.");
        }

        public void HomeMachine()
        {
            StopContinuousMachining();
            SetMachineState(MachineState.HOMING);
            InvokeControllerMethod("HomeMachine", required: false);
            progressPercent = 0f;
            PublishRuntime(false);
            SetMachineState(MachineState.READY);
            Debug.Log("Machine homed.");
        }

        public void PauseMachining()
        {
            if (!IsRunning || IsPaused)
            {
                return;
            }

            IsPaused = true;
            SetMachineState(MachineState.PAUSED);
            InvokeControllerMethod("PauseMachining", required: false);
            PublishRuntime(false);
            Debug.Log("Machine paused.");
        }

        public void ResumeMachining()
        {
            if (!IsRunning || !IsPaused)
            {
                return;
            }

            IsPaused = false;
            SetMachineState(MachineState.MACHINING);
            InvokeControllerMethod("ResumeMachining", required: false);
            Debug.Log("Machine resumed.");
        }

        public void EmergencyStop()
        {
            StopContinuousMachining();
            SetMachineState(MachineState.EMERGENCY_STOP);
            InvokeControllerMethod("EmergencyStop", required: false);
            PublishRuntime(false);
            Debug.LogWarning("Emergency stop executed.");
        }

        public void NotifyMachiningFinished()
        {
            StopMachining();
        }

        public void PublishCurrentState()
        {
            PublishRuntime(currentState == MachineState.MACHINING);
        }

        private IEnumerator ContinuousMachiningLoop()
        {
            SetMachineState(MachineState.MACHINING);
            var wait = new WaitForSeconds(0.1f);

            while (IsRunning)
            {
                if (!IsPaused)
                {
                    MachineParameters parameters = GetParameters();
                    float cycleDuration = EstimateCycleDurationSeconds(parameters);
                    elapsedTimeSeconds += 0.1f;
                    progressPercent = Mathf.Repeat((elapsedTimeSeconds / Mathf.Max(cycleDuration, 1f)) * 100f, 100f);
                    remainingTimeSeconds = Mathf.Max(0f, cycleDuration - Mathf.Repeat(elapsedTimeSeconds, cycleDuration));
                    UpdateDerivedParameters(parameters, 0.1f);
                    PublishRuntime(true);
                }

                yield return wait;
            }

            machiningCoroutine = null;
        }

        private void StopContinuousMachining()
        {
            IsRunning = false;
            IsPaused = false;

            if (machiningCoroutine != null)
            {
                StopCoroutine(machiningCoroutine);
                machiningCoroutine = null;
            }
        }

        private MachineParameters GetParameters()
        {
            if (parameterManager == null) parameterManager = FindFirstObjectByType<MachineParameterManager>();
            return parameterManager != null ? parameterManager.Current : new MachineParameters();
        }

        private float EstimateCycleDurationSeconds(MachineParameters parameters)
        {
            float depth = Mathf.Max(parameters.depthOfCutMm > 0f ? parameters.depthOfCutMm : nominalDepthMm, 1f);
            float mrr = Mathf.Max(CalculateMrr(parameters), 0.05f);
            return Mathf.Clamp((depth / mrr) * 60f, 20f, 3600f);
        }

        private float CalculateMrr(MachineParameters parameters)
        {
            float duty = parameters.pulseOnUs / Mathf.Max(parameters.pulseOnUs + parameters.pulseOffUs, 1f);
            float energy = Mathf.Max(parameters.currentA, 1f) * Mathf.Max(parameters.gapVoltageV, 1f) * Mathf.Max(parameters.pulseOnUs, 1f) * 0.000001f;
            float flushing = Mathf.Clamp(parameters.flushingPressureBar / 3f, 0.5f, 1.5f);
            return Mathf.Clamp(energy * duty * flushing * 12f, 0.05f, 25f);
        }

        private void UpdateDerivedParameters(MachineParameters parameters, float deltaSeconds)
        {
            parameters.mrr = CalculateMrr(parameters);
            parameters.temperatureC = Mathf.Clamp(parameters.temperatureC + (parameters.currentA * parameters.pulseOnUs * 0.000015f - parameters.pulseOffUs * 0.00008f) * deltaSeconds, 22f, 85f);
            parameters.toolWear = Mathf.Clamp(parameters.toolWear + parameters.mrr * Mathf.Max(parameters.currentA, 1f) * 0.00002f * deltaSeconds, 0f, 100f);
        }

        private void PublishRuntime(bool sparkActive)
        {
            if (telemetryPublisher == null) telemetryPublisher = FindFirstObjectByType<MachineTelemetryPublisher>();
            if (telemetryPublisher != null)
            {
                telemetryPublisher.SetRuntime(currentState, elapsedTimeSeconds, remainingTimeSeconds, progressPercent, sparkActive);
            }

            SendUnityState(StateToStatus(currentState));
        }

        private void SetMachineState(MachineState state)
        {
            if (currentState == state)
            {
                PublishRuntime(state == MachineState.MACHINING);
                return;
            }

            currentState = state;
            MachineEvents.RaiseStateChanged(state);
            PublishRuntime(state == MachineState.MACHINING);
        }

        private static string StateToStatus(MachineState state)
        {
            return state == MachineState.MACHINING ? "machining" : "idle";
        }

        private void SendUnityState(string status)
        {
            if (webSocketClient == null) webSocketClient = FindFirstObjectByType<WebSocketClient>();

            if (webSocketClient == null)
            {
                Debug.LogWarning($"Cannot publish Unity state '{status}' because WebSocketClient is missing.");
                return;
            }

            webSocketClient.Send(GatewayMessageFactory.UnityState(status, currentState.ToString(), elapsedTimeSeconds, remainingTimeSeconds, progressPercent));
        }

        private void InvokeControllerMethod(string methodName, bool required)
        {
            if (machineController == null)
            {
                if (required) Debug.LogWarning($"Cannot call {methodName} because machineController is not assigned.");
                return;
            }

            MethodInfo method = machineController.GetType().GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null)
            {
                if (required) Debug.LogWarning($"Assigned machine controller does not contain method {methodName}().");
                return;
            }

            method.Invoke(machineController, null);
        }
    }
}
