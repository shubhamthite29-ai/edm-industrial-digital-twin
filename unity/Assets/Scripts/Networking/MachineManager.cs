using System;
using System.Collections;
using System.Reflection;
using EDMDigitalTwin.Machine;
using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public class MachineManager : MonoBehaviour
    {
        [Header("Existing Machine Controller")]
        [Tooltip("Assign your existing Machinecontroller/MachineController component here. The integration will call matching methods when they exist.")]
        public MonoBehaviour machineController;

        [Header("Runtime References")]
        [SerializeField] private WebSocketClient webSocketClient;
        [SerializeField] private MachineParameterManager parameterManager;
        [SerializeField] private MachineTelemetryPublisher telemetryPublisher;

        [Header("Optional Motion Targets")]
        [SerializeField] private Transform toolTransform;
        [SerializeField] private Transform tankTransform;
        [SerializeField] private ParticleSystem sparkParticleSystem;
        [SerializeField] private GameObject sparkObject;

        [Header("Continuous Machining")]
        [SerializeField] private MachineState currentState = MachineState.READY;
        [SerializeField] private float nominalDepthMm = 18f;
        [SerializeField] private float toolTravelMm = 40f;
        [SerializeField] private float tankTravelMm = 25f;
        [SerializeField] private float minimumCycleSeconds = 20f;
        [SerializeField] private float maximumCycleSeconds = 3600f;

        private Coroutine machiningCoroutine;
        private Vector3 toolHomeLocalPosition;
        private Vector3 tankHomeLocalPosition;
        private bool homeCaptured;
        private float elapsedTimeSeconds;
        private float remainingTimeSeconds;
        private float progressPercent;
        private float currentToolPosition;
        private float currentTankPosition;
        private bool autoTargetResolveAttempted;
        private bool appliedSparkActive;

        public bool IsRunning { get; private set; }
        public bool IsPaused { get; private set; }
        public MachineState CurrentState => currentState;

        private void Awake()
        {
            ResolveReferences();
            CaptureHomePositions();
            ApplySpark(false);
            PublishRuntime(false);
        }

        public void StartMachining()
        {
            ResolveReferences();

            if (currentState == MachineState.EMERGENCY_STOP)
            {
                Debug.LogWarning("Start command ignored because machine is in EMERGENCY_STOP. Press Reset before starting.");
                PublishRuntime(false);
                return;
            }

            if (machiningCoroutine != null || IsRunning)
            {
                Debug.Log("Start command ignored because continuous machining is already active.");
                PublishRuntime(!IsPaused);
                return;
            }

            CaptureHomePositions();
            IsRunning = true;
            IsPaused = false;
            elapsedTimeSeconds = 0f;
            progressPercent = 0f;
            currentToolPosition = 0f;
            currentTankPosition = 0f;
            remainingTimeSeconds = EstimateCycleDurationSeconds(GetParameters());

            SetMachineState(MachineState.STARTING, sparkActive: false);
            InvokeControllerMethod("StartMachining", required: false);
            machiningCoroutine = StartCoroutine(ContinuousMachiningLoop());
            Debug.Log("START command accepted. Continuous EDM machining started.");
        }

        public void StopMachining()
        {
            StopContinuousMachining();
            ApplySpark(false);
            SetMachineState(MachineState.STOPPED, sparkActive: false);
            InvokeControllerMethod("StopMachining", required: false);
            Debug.Log("STOP command accepted. Machine stopped safely.");
        }

        public void ResetMachine()
        {
            StopContinuousMachining();
            elapsedTimeSeconds = 0f;
            progressPercent = 0f;
            remainingTimeSeconds = EstimateCycleDurationSeconds(GetParameters());
            currentToolPosition = 0f;
            currentTankPosition = 0f;
            MoveMachine(progressPercent);
            ApplySpark(false);
            SetMachineState(MachineState.RESETTING, sparkActive: false);
            InvokeControllerMethod("ResetMachine", required: false);
            SetMachineState(MachineState.READY, sparkActive: false);
            Debug.Log("RESET command accepted. Machine returned to READY.");
        }

        public void HomeMachine()
        {
            StopContinuousMachining();
            progressPercent = 0f;
            currentToolPosition = 0f;
            currentTankPosition = 0f;
            MoveMachine(progressPercent);
            ApplySpark(false);
            SetMachineState(MachineState.HOMING, sparkActive: false);
            InvokeControllerMethod("HomeMachine", required: false);
            SetMachineState(MachineState.READY, sparkActive: false);
            Debug.Log("HOME command accepted. Machine homed.");
        }

        public void PauseMachining()
        {
            if (!IsRunning || IsPaused)
            {
                PublishRuntime(false);
                return;
            }

            IsPaused = true;
            ApplySpark(false);
            SetMachineState(MachineState.PAUSED, sparkActive: false);
            InvokeControllerMethod("PauseMachining", required: false);
            Debug.Log("PAUSE command accepted. Machine paused.");
        }

        public void ResumeMachining()
        {
            if (!IsRunning || !IsPaused)
            {
                PublishRuntime(false);
                return;
            }

            IsPaused = false;
            SetMachineState(MachineState.MACHINING, sparkActive: true);
            InvokeControllerMethod("ResumeMachining", required: false);
            Debug.Log("RESUME command accepted. Machine resumed.");
        }

        public void EmergencyStop()
        {
            StopContinuousMachining();
            ApplySpark(false);
            SetMachineState(MachineState.EMERGENCY_STOP, sparkActive: false);
            InvokeControllerMethod("EmergencyStop", required: false);
            Debug.LogWarning("EMERGENCY STOP command accepted. Machine stopped immediately.");
        }

        public void NotifyMachiningFinished()
        {
            StopMachining();
        }

        public void PublishCurrentState()
        {
            PublishRuntime(IsRunning && !IsPaused && currentState == MachineState.MACHINING);
            SendUnityState(StateToStatus(currentState));
        }

        private IEnumerator ContinuousMachiningLoop()
        {
            SetMachineState(MachineState.MACHINING, sparkActive: true);

            while (IsRunning)
            {
                if (!IsPaused)
                {
                    float deltaSeconds = Mathf.Max(Time.deltaTime, 0.001f);
                    MachineParameters parameters = GetParameters();
                    float cycleDuration = EstimateCycleDurationSeconds(parameters);

                    elapsedTimeSeconds += deltaSeconds;
                    progressPercent = Mathf.Repeat((elapsedTimeSeconds / Mathf.Max(cycleDuration, 1f)) * 100f, 100f);
                    remainingTimeSeconds = Mathf.Max(0f, cycleDuration - Mathf.Repeat(elapsedTimeSeconds, cycleDuration));

                    UpdateDerivedParameters(parameters, deltaSeconds);
                    MoveMachine(progressPercent);
                    ApplySpark(true);
                    PublishRuntime(true);
                }

                yield return null;
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

        private void ResolveReferences()
        {
            if (webSocketClient == null) webSocketClient = FindFirstObjectByType<WebSocketClient>();
            if (parameterManager == null) parameterManager = FindFirstObjectByType<MachineParameterManager>();
            if (telemetryPublisher == null) telemetryPublisher = FindFirstObjectByType<MachineTelemetryPublisher>();
            AutoResolveMotionTargets();
        }

        private void AutoResolveMotionTargets()
        {
            if (autoTargetResolveAttempted)
            {
                return;
            }

            autoTargetResolveAttempted = true;
            Transform[] transforms = FindObjectsByType<Transform>(FindObjectsSortMode.None);

            foreach (Transform candidate in transforms)
            {
                string lowerName = candidate.name.ToLowerInvariant();

                if (toolTransform == null && (lowerName.Contains("tool") || lowerName.Contains("electrode") || lowerName.Contains("head")))
                {
                    toolTransform = candidate;
                }

                if (tankTransform == null && lowerName.Contains("tank"))
                {
                    tankTransform = candidate;
                }

                if (sparkObject == null && lowerName.Contains("spark"))
                {
                    sparkObject = candidate.gameObject;
                }
            }

            if (sparkParticleSystem == null && sparkObject != null)
            {
                sparkParticleSystem = sparkObject.GetComponentInChildren<ParticleSystem>();
            }
        }

        private void CaptureHomePositions()
        {
            if (homeCaptured)
            {
                return;
            }

            toolHomeLocalPosition = toolTransform != null ? toolTransform.localPosition : Vector3.zero;
            tankHomeLocalPosition = tankTransform != null ? tankTransform.localPosition : Vector3.zero;
            homeCaptured = true;
        }

        private MachineParameters GetParameters()
        {
            ResolveReferences();
            return parameterManager != null ? parameterManager.Current : new MachineParameters();
        }

        private float EstimateCycleDurationSeconds(MachineParameters parameters)
        {
            float depth = Mathf.Max(parameters.depthOfCutMm > 0f ? parameters.depthOfCutMm : nominalDepthMm, 1f);
            float mrr = Mathf.Max(CalculateMrr(parameters), 0.05f);
            return Mathf.Clamp((depth / mrr) * 60f, minimumCycleSeconds, maximumCycleSeconds);
        }

        private float CalculateMrr(MachineParameters parameters)
        {
            float duty = parameters.pulseOnUs / Mathf.Max(parameters.pulseOnUs + parameters.pulseOffUs, 1f);
            float sparkEnergy = Mathf.Max(parameters.currentA, 1f) * Mathf.Max(parameters.gapVoltageV, 1f) * Mathf.Max(parameters.pulseOnUs, 1f) * 0.000001f;
            float voltageFactor = Mathf.Clamp(parameters.voltageV / 90f, 0.4f, 1.8f);
            float flushingFactor = Mathf.Clamp(parameters.flushingPressureBar / 3f, 0.5f, 1.5f);
            return Mathf.Clamp(sparkEnergy * duty * voltageFactor * flushingFactor * 12f, 0.05f, 25f);
        }

        private void UpdateDerivedParameters(MachineParameters parameters, float deltaSeconds)
        {
            parameters.mrr = CalculateMrr(parameters);
            float heatRise = parameters.currentA * parameters.pulseOnUs * 0.000015f;
            float pulseCooling = parameters.pulseOffUs * 0.00008f;
            parameters.temperatureC = Mathf.Clamp(parameters.temperatureC + (heatRise - pulseCooling) * deltaSeconds, 22f, 85f);
            parameters.toolWear = Mathf.Clamp(parameters.toolWear + parameters.mrr * Mathf.Max(parameters.currentA, 1f) * 0.00002f * deltaSeconds, 0f, 100f);
        }

        private void MoveMachine(float progress)
        {
            float normalized = Mathf.Clamp01(progress / 100f);
            MachineParameters parameters = GetParameters();
            float mrrFactor = Mathf.Clamp(CalculateMrr(parameters) / 8f, 0.25f, 2.5f);
            float toolTravel = (toolTravelMm / 1000f) * normalized * mrrFactor;
            float tankTravel = (tankTravelMm / 1000f) * Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(normalized * 1.25f));

            currentToolPosition = toolTravel;
            currentTankPosition = tankTravel;

            if (toolTransform != null)
            {
                toolTransform.localPosition = toolHomeLocalPosition + Vector3.down * toolTravel;
            }

            if (tankTransform != null)
            {
                tankTransform.localPosition = tankHomeLocalPosition + Vector3.up * tankTravel;
            }
        }

        private void ApplySpark(bool active)
        {
            bool changed = appliedSparkActive != active;
            appliedSparkActive = active;

            if (sparkObject != null && sparkObject.activeSelf != active)
            {
                sparkObject.SetActive(active);
            }

            if (sparkParticleSystem != null)
            {
                if (active && !sparkParticleSystem.isPlaying)
                {
                    sparkParticleSystem.Play();
                }
                else if (!active && sparkParticleSystem.isPlaying)
                {
                    sparkParticleSystem.Stop(true, ParticleSystemStopBehavior.StopEmitting);
                }

                MachineParameters parameters = GetParameters();
                ParticleSystem.MainModule main = sparkParticleSystem.main;
                main.startLifetime = Mathf.Clamp(parameters.pulseOnUs / 1000f, 0.03f, 0.35f);
                main.startSpeed = Mathf.Clamp(parameters.currentA * 0.12f, 0.5f, 8f);
                main.startSize = Mathf.Clamp(parameters.currentA / 80f, 0.05f, 0.6f);
            }

            if (!changed)
            {
                return;
            }

            if (active)
            {
                MachineEvents.RaiseSparkStarted();
            }
            else
            {
                MachineEvents.RaiseSparkStopped();
            }
        }

        private void PublishRuntime(bool sparkActive)
        {
            ResolveReferences();

            if (telemetryPublisher != null)
            {
                telemetryPublisher.SetRuntime(currentState, elapsedTimeSeconds, remainingTimeSeconds, progressPercent, sparkActive, currentToolPosition, currentTankPosition);
            }
        }

        private void SetMachineState(MachineState state, bool sparkActive)
        {
            MachineState previousState = currentState;
            currentState = state;
            PublishRuntime(sparkActive);
            MachineEvents.RaiseStateChanged(state);

            if (previousState != MachineState.MACHINING && state == MachineState.MACHINING && elapsedTimeSeconds <= 0.2f)
            {
                MachineEvents.RaiseMachineStarted();
            }
            else if (state == MachineState.STOPPED || state == MachineState.EMERGENCY_STOP)
            {
                MachineEvents.RaiseMachineFinished();
            }

            SendUnityState(StateToStatus(currentState));
        }

        private static string StateToStatus(MachineState state)
        {
            return state == MachineState.MACHINING ? "machining" : "idle";
        }

        private void SendUnityState(string status)
        {
            ResolveReferences();

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
