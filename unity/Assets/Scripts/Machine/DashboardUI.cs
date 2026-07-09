using EDMDigitalTwin.Networking;
using TMPro;
using UnityEngine;

namespace EDMDigitalTwin.Machine
{
    public class DashboardUI : MonoBehaviour
    {
        [Header("Data")]
        [SerializeField] private MachineParameterManager parameterManager;
        [SerializeField] private MachineTelemetryPublisher telemetryPublisher;
        [SerializeField] private WebSocketClient webSocketClient;

        [Header("TextMeshPro Fields")]
        [SerializeField] private TMP_Text statusText;
        [SerializeField] private TMP_Text currentText;
        [SerializeField] private TMP_Text voltageText;
        [SerializeField] private TMP_Text gapVoltageText;
        [SerializeField] private TMP_Text pulseOnText;
        [SerializeField] private TMP_Text pulseOffText;
        [SerializeField] private TMP_Text temperatureText;
        [SerializeField] private TMP_Text mrrText;
        [SerializeField] private TMP_Text toolWearText;
        [SerializeField] private TMP_Text cycleText;
        [SerializeField] private TMP_Text connectionText;

        private MachineState currentState = MachineState.READY;
        private bool connected;

        private void Awake()
        {
            if (parameterManager == null)
            {
                parameterManager = FindFirstObjectByType<MachineParameterManager>();
            }

            if (telemetryPublisher == null)
            {
                telemetryPublisher = FindFirstObjectByType<MachineTelemetryPublisher>();
            }

            if (webSocketClient == null)
            {
                webSocketClient = FindFirstObjectByType<WebSocketClient>();
            }
        }

        private void OnEnable()
        {
            MachineEvents.ParameterChanged += HandleParameterChanged;
            MachineEvents.StateChanged += HandleStateChanged;

            if (webSocketClient != null)
            {
                connected = webSocketClient.IsConnected;
                webSocketClient.ConnectionChanged += HandleConnectionChanged;
            }

            Refresh();
        }

        private void OnDisable()
        {
            MachineEvents.ParameterChanged -= HandleParameterChanged;
            MachineEvents.StateChanged -= HandleStateChanged;

            if (webSocketClient != null)
            {
                webSocketClient.ConnectionChanged -= HandleConnectionChanged;
            }
        }

        public void Refresh()
        {
            MachineParameters parameters = parameterManager != null ? parameterManager.Current : new MachineParameters();

            SetText(statusText, currentState.ToString());
            SetText(currentText, $"{parameters.currentA:0.0} A");
            SetText(voltageText, $"{parameters.voltageV:0} V");
            SetText(gapVoltageText, $"{parameters.gapVoltageV:0} V");
            SetText(pulseOnText, $"{parameters.pulseOnUs:0} us");
            SetText(pulseOffText, $"{parameters.pulseOffUs:0} us");
            SetText(temperatureText, $"{parameters.temperatureC:0.0} C");
            SetText(mrrText, $"{parameters.mrr:0.00} mm3/min");
            SetText(toolWearText, $"{parameters.toolWear:0.00} %");
            SetText(cycleText, telemetryPublisher != null ? $"{telemetryPublisher.CyclePercent:0} %" : "0 %");
            SetText(connectionText, connected ? "Gateway Connected" : "Gateway Disconnected");
        }

        private void HandleParameterChanged(MachineParameters parameters) => Refresh();

        private void HandleStateChanged(MachineState state)
        {
            currentState = state;
            Refresh();
        }

        private void HandleConnectionChanged(bool isConnected)
        {
            connected = isConnected;
            Refresh();
        }

        private static void SetText(TMP_Text text, string value)
        {
            if (text != null)
            {
                text.text = value;
            }
        }
    }
}
