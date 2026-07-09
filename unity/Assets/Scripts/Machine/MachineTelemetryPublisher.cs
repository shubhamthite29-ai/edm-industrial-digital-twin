using System;
using System.Collections;
using System.Globalization;
using System.Text;
using EDMDigitalTwin.Networking;
using UnityEngine;

namespace EDMDigitalTwin.Machine
{
    public class MachineTelemetryPublisher : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private WebSocketClient webSocketClient;
        [SerializeField] private MachineParameterManager parameterManager;
        [SerializeField] private Transform toolTransform;
        [SerializeField] private Transform tankTransform;

        [Header("Telemetry")]
        [SerializeField] private MachineState machineState = MachineState.READY;
        [SerializeField] private float cyclePercent;
        [SerializeField] private bool sparkActive;
        [SerializeField] private float publishIntervalSeconds = 0.25f;

        private Coroutine publishCoroutine;
        private float machineTimeSeconds;
        private float elapsedTimeSeconds;
        private float remainingTimeSeconds;
        private float progressPercent;
        private float runtimeToolPosition;
        private float runtimeTankPosition;
        private bool hasRuntimePositions;

        public MachineState CurrentState => machineState;
        public float CyclePercent => cyclePercent;
        public float ProgressPercent => progressPercent;
        public float ElapsedTimeSeconds => elapsedTimeSeconds;
        public float RemainingTimeSeconds => remainingTimeSeconds;
        public bool SparkActive => sparkActive;

        private void Awake()
        {
            if (webSocketClient == null)
            {
                webSocketClient = FindFirstObjectByType<WebSocketClient>();
            }

            if (parameterManager == null)
            {
                parameterManager = FindFirstObjectByType<MachineParameterManager>();
            }
        }

        private void OnEnable()
        {
            MachineEvents.ParameterChanged += HandleParameterChanged;
            MachineEvents.StateChanged += HandleStateChanged;
            MachineEvents.MachineStarted += HandleMachineStarted;
            MachineEvents.MachineFinished += HandleMachineFinished;
            MachineEvents.SparkStarted += HandleSparkStarted;
            MachineEvents.SparkStopped += HandleSparkStopped;

            publishCoroutine = StartCoroutine(PublishLoop());
        }

        private void OnDisable()
        {
            MachineEvents.ParameterChanged -= HandleParameterChanged;
            MachineEvents.StateChanged -= HandleStateChanged;
            MachineEvents.MachineStarted -= HandleMachineStarted;
            MachineEvents.MachineFinished -= HandleMachineFinished;
            MachineEvents.SparkStarted -= HandleSparkStarted;
            MachineEvents.SparkStopped -= HandleSparkStopped;

            if (publishCoroutine != null)
            {
                StopCoroutine(publishCoroutine);
                publishCoroutine = null;
            }
        }

        public void SetCyclePercent(float value)
        {
            cyclePercent = Mathf.Clamp(value, 0f, 100f);
            progressPercent = cyclePercent;
            PublishNow();
        }

        public void SetRuntime(MachineState state, float elapsedSeconds, float remainingSeconds, float progress, bool isSparkActive)
        {
            machineState = state;
            elapsedTimeSeconds = Mathf.Max(0f, elapsedSeconds);
            remainingTimeSeconds = Mathf.Max(0f, remainingSeconds);
            progressPercent = Mathf.Clamp(progress, 0f, 100f);
            cyclePercent = progressPercent;
            sparkActive = isSparkActive;
        }

        public void SetRuntime(MachineState state, float elapsedSeconds, float remainingSeconds, float progress, bool isSparkActive, float toolPosition, float tankPosition)
        {
            runtimeToolPosition = toolPosition;
            runtimeTankPosition = tankPosition;
            hasRuntimePositions = true;
            SetRuntime(state, elapsedSeconds, remainingSeconds, progress, isSparkActive);
        }

        public void SetSparkActive(bool value)
        {
            if (sparkActive == value)
            {
                return;
            }

            sparkActive = value;
            if (sparkActive)
            {
                MachineEvents.RaiseSparkStarted();
            }
            else
            {
                MachineEvents.RaiseSparkStopped();
            }
        }

        public void SetMachineState(MachineState state)
        {
            if (machineState == state)
            {
                return;
            }

            machineState = state;
            MachineEvents.RaiseStateChanged(state);
        }

        public void PublishNow()
        {
            if (webSocketClient == null)
            {
                webSocketClient = FindFirstObjectByType<WebSocketClient>();
            }

            if (webSocketClient == null || !webSocketClient.IsConnected)
            {
                return;
            }

            webSocketClient.SendRawJson(BuildTelemetryJson());
        }

        private IEnumerator PublishLoop()
        {
            var wait = new WaitForSeconds(Mathf.Max(0.1f, publishIntervalSeconds));

            while (true)
            {
                machineTimeSeconds += publishIntervalSeconds;
                PublishNow();
                yield return wait;
            }
        }

        private void HandleParameterChanged(MachineParameters parameters) => PublishNow();

        private void HandleStateChanged(MachineState state)
        {
            machineState = state;
            PublishNow();
        }

        private void HandleMachineStarted()
        {
            machineState = MachineState.MACHINING;
            cyclePercent = 0f;
            PublishNow();
        }

        private void HandleMachineFinished()
        {
            machineState = MachineState.STOPPED;
            cyclePercent = 100f;
            sparkActive = false;
            PublishNow();
        }

        private void HandleSparkStarted()
        {
            sparkActive = true;
            PublishNow();
        }

        private void HandleSparkStopped()
        {
            sparkActive = false;
            PublishNow();
        }

        private string BuildTelemetryJson()
        {
            MachineParameters parameters = parameterManager != null ? parameterManager.Current : new MachineParameters();
            string status = machineState == MachineState.MACHINING ? "machining" : "idle";
            string now = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture);

            var builder = new StringBuilder(640);
            builder.Append("{");
            AppendString(builder, "schemaVersion", "1.0");
            builder.Append(",");
            AppendString(builder, "messageId", Guid.NewGuid().ToString());
            builder.Append(",");
            AppendString(builder, "timestamp", now);
            builder.Append(",");
            AppendString(builder, "source", "unity");
            builder.Append(",");
            AppendString(builder, "type", GatewayMessageTypes.UnityState);
            builder.Append(",\"payload\":{");
            AppendString(builder, "status", status);
            builder.Append(",");
            AppendString(builder, "machineState", machineState.ToString());
            builder.Append(",");
            AppendNumber(builder, "currentA", parameters.currentA);
            builder.Append(",");
            AppendNumber(builder, "voltageV", parameters.voltageV);
            builder.Append(",");
            AppendNumber(builder, "gapVoltageV", parameters.gapVoltageV);
            builder.Append(",");
            AppendNumber(builder, "pulseOnUs", parameters.pulseOnUs);
            builder.Append(",");
            AppendNumber(builder, "pulseOffUs", parameters.pulseOffUs);
            builder.Append(",");
            AppendNumber(builder, "temperatureC", parameters.temperatureC);
            builder.Append(",");
            AppendNumber(builder, "mrr", parameters.mrr);
            builder.Append(",");
            AppendNumber(builder, "toolWear", parameters.toolWear);
            builder.Append(",");
            AppendNumber(builder, "cyclePercent", cyclePercent);
            builder.Append(",");
            AppendNumber(builder, "progressPercent", progressPercent);
            builder.Append(",");
            AppendNumber(builder, "toolPosition", toolTransform != null ? toolTransform.localPosition.y : hasRuntimePositions ? runtimeToolPosition : 0f);
            builder.Append(",");
            AppendNumber(builder, "tankPosition", tankTransform != null ? tankTransform.localPosition.y : hasRuntimePositions ? runtimeTankPosition : 0f);
            builder.Append(",");
            AppendBoolean(builder, "sparkActive", sparkActive);
            builder.Append(",");
            AppendNumber(builder, "machineTimeSeconds", machineTimeSeconds);
            builder.Append(",");
            AppendNumber(builder, "elapsedTimeSeconds", elapsedTimeSeconds);
            builder.Append(",");
            AppendNumber(builder, "remainingTimeSeconds", remainingTimeSeconds);
            builder.Append("}}");
            return builder.ToString();
        }

        private static void AppendString(StringBuilder builder, string key, string value)
        {
            builder.Append("\"").Append(key).Append("\":\"").Append(Escape(value)).Append("\"");
        }

        private static void AppendNumber(StringBuilder builder, string key, float value)
        {
            builder.Append("\"").Append(key).Append("\":").Append(value.ToString("0.###", CultureInfo.InvariantCulture));
        }

        private static void AppendBoolean(StringBuilder builder, string key, bool value)
        {
            builder.Append("\"").Append(key).Append("\":").Append(value ? "true" : "false");
        }

        private static string Escape(string value)
        {
            return (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"");
        }
    }
}
