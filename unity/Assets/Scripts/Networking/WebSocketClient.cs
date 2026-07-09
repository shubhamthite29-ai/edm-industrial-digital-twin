using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Text;
using EDMDigitalTwin.Machine;
using NativeWebSocket;
using UnityEngine;

namespace EDMDigitalTwin.Networking
{
    public class WebSocketClient : MonoBehaviour
    {
        [Header("Gateway")]
        [SerializeField] private string gatewayUrl = "ws://localhost:8080";
        [SerializeField] private bool connectOnStart = true;

        [Header("Runtime")]
        [SerializeField] private MachineManager machineManager;
        [SerializeField] private MachineParameterManager machineParameterManager;
        [SerializeField] private CameraManager cameraManager;
        [SerializeField] private float reconnectDelaySeconds = 2f;
        [SerializeField] private float heartbeatIntervalSeconds = 10f;
        [SerializeField] private bool verboseLogging = true;

        private readonly ConcurrentQueue<Action> mainThreadActions = new ConcurrentQueue<Action>();
        private WebSocket webSocket;
        private Coroutine reconnectCoroutine;
        private Coroutine heartbeatCoroutine;
        private bool intentionallyClosed;
        private bool isConnecting;

        public bool IsConnected => webSocket != null && webSocket.State == WebSocketState.Open;
        public event Action<bool> ConnectionChanged;

        public string GatewayUrl
        {
            get => gatewayUrl;
            set => gatewayUrl = value;
        }

        private void Awake()
        {
            if (machineManager == null)
            {
                machineManager = FindFirstObjectByType<MachineManager>();
            }

            if (machineParameterManager == null)
            {
                machineParameterManager = FindFirstObjectByType<MachineParameterManager>();
            }

            if (cameraManager == null)
            {
                cameraManager = FindFirstObjectByType<CameraManager>();
            }
        }

        private void Start()
        {
            if (connectOnStart)
            {
                Connect();
            }
        }

        private void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            webSocket?.DispatchMessageQueue();
#endif

            while (mainThreadActions.TryDequeue(out Action action))
            {
                action?.Invoke();
            }
        }

        private async void OnApplicationQuit()
        {
            intentionallyClosed = true;

            if (heartbeatCoroutine != null)
            {
                StopCoroutine(heartbeatCoroutine);
                heartbeatCoroutine = null;
            }

            if (webSocket != null)
            {
                await webSocket.Close();
            }
        }

        public async void Connect()
        {
            if (isConnecting || webSocket?.State == WebSocketState.Open)
            {
                return;
            }

            intentionallyClosed = false;
            isConnecting = true;

            try
            {
                webSocket = new WebSocket(gatewayUrl);
                RegisterCallbacks(webSocket);

                Log($"Connecting to gateway: {gatewayUrl}");
                await webSocket.Connect();
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Gateway connection failed: {exception.Message}");
                ScheduleReconnect();
            }
            finally
            {
                isConnecting = false;
            }
        }

        public async void Disconnect()
        {
            intentionallyClosed = true;

            if (reconnectCoroutine != null)
            {
                StopCoroutine(reconnectCoroutine);
                reconnectCoroutine = null;
            }

            if (heartbeatCoroutine != null)
            {
                StopCoroutine(heartbeatCoroutine);
                heartbeatCoroutine = null;
            }

            if (webSocket != null)
            {
                await webSocket.Close();
            }
        }

        public async void Send(GatewayMessage message)
        {
            if (webSocket == null || webSocket.State != WebSocketState.Open)
            {
                Debug.LogWarning($"Cannot send {message?.type ?? "message"} because gateway is not connected.");
                return;
            }

            string json = GatewayMessageFactory.ToJson(message);
            await webSocket.SendText(json);
            Log($"Sent: {json}");
        }

        public async void SendRawJson(string json)
        {
            if (webSocket == null || webSocket.State != WebSocketState.Open)
            {
                Debug.LogWarning("Cannot send raw gateway message because gateway is not connected.");
                return;
            }

            await webSocket.SendText(json);
            Log($"Sent: {json}");
        }

        private void RegisterCallbacks(WebSocket socket)
        {
            socket.OnOpen += () =>
            {
                mainThreadActions.Enqueue(() =>
                {
                    Log("Connected to gateway.");
                    ConnectionChanged?.Invoke(true);
                    Send(GatewayMessageFactory.ClientHello());

                    if (heartbeatCoroutine != null)
                    {
                        StopCoroutine(heartbeatCoroutine);
                    }

                    heartbeatCoroutine = StartCoroutine(HeartbeatLoop());
                });
            };

            socket.OnMessage += bytes =>
            {
                string json = Encoding.UTF8.GetString(bytes);
                mainThreadActions.Enqueue(() => HandleIncomingMessage(json));
            };

            socket.OnError += error =>
            {
                mainThreadActions.Enqueue(() =>
                {
                    Debug.LogWarning($"Gateway socket error: {error}");
                });
            };

            socket.OnClose += code =>
            {
                mainThreadActions.Enqueue(() =>
                {
                    Log($"Gateway connection closed with code {code}.");
                    ConnectionChanged?.Invoke(false);

                    if (heartbeatCoroutine != null)
                    {
                        StopCoroutine(heartbeatCoroutine);
                        heartbeatCoroutine = null;
                    }

                    if (!intentionallyClosed)
                    {
                        ScheduleReconnect();
                    }
                });
            };
        }

        private void HandleIncomingMessage(string json)
        {
            Log($"Received: {json}");

            if (!GatewayMessageFactory.TryFromJson(json, out GatewayMessage message))
            {
                return;
            }

            if (message.type == GatewayMessageTypes.MachineCommand)
            {
                HandleMachineCommand(message);
                return;
            }

            if (message.type == GatewayMessageTypes.MachineParametersPatch)
            {
                GetMachineParameterManager()?.ApplyPatchJson(json);
                return;
            }

            if (message.type == GatewayMessageTypes.CameraCommand)
            {
                GetCameraManager()?.SetView(message.payload?.view);
                return;
            }

            if (message.type == GatewayMessageTypes.Ack || message.type == GatewayMessageTypes.Heartbeat)
            {
                return;
            }

            if (message.type == GatewayMessageTypes.Error)
            {
                Debug.LogWarning($"Gateway error: {message.payload?.code} {message.payload?.detail}");
            }
        }

        private void HandleMachineCommand(GatewayMessage message)
        {
            string command = message.payload?.command?.ToLowerInvariant();

            switch (command)
            {
                case "start":
                    GetMachineManager()?.StartMachining();
                    break;
                case "stop":
                    GetMachineManager()?.StopMachining();
                    break;
                case "reset":
                    GetMachineManager()?.ResetMachine();
                    break;
                case "home":
                    GetMachineManager()?.HomeMachine();
                    break;
                case "pause":
                    GetMachineManager()?.PauseMachining();
                    break;
                case "resume":
                    GetMachineManager()?.ResumeMachining();
                    break;
                case "request_status":
                    GetMachineManager()?.PublishCurrentState();
                    break;
                case "emergency_stop":
                    GetMachineManager()?.EmergencyStop();
                    break;
                default:
                    Debug.LogWarning($"Unsupported machine command: {command}");
                    break;
            }
        }

        private MachineManager GetMachineManager()
        {
            if (machineManager == null)
            {
                machineManager = FindFirstObjectByType<MachineManager>();
            }

            if (machineManager == null)
            {
                Debug.LogWarning("MachineManager is missing. Add MachineManager to a scene object.");
            }

            return machineManager;
        }

        private MachineParameterManager GetMachineParameterManager()
        {
            if (machineParameterManager == null)
            {
                machineParameterManager = FindFirstObjectByType<MachineParameterManager>();
            }

            if (machineParameterManager == null)
            {
                Debug.LogWarning("MachineParameterManager is missing. Add MachineParameterManager to a scene object.");
            }

            return machineParameterManager;
        }

        private CameraManager GetCameraManager()
        {
            if (cameraManager == null)
            {
                cameraManager = FindFirstObjectByType<CameraManager>();
            }

            if (cameraManager == null)
            {
                Debug.LogWarning("CameraManager is missing. Add CameraManager to a scene object.");
            }

            return cameraManager;
        }

        private IEnumerator HeartbeatLoop()
        {
            var wait = new WaitForSeconds(heartbeatIntervalSeconds);

            while (webSocket != null && webSocket.State == WebSocketState.Open)
            {
                Send(GatewayMessageFactory.Heartbeat());
                yield return wait;
            }
        }

        private void ScheduleReconnect()
        {
            if (intentionallyClosed || reconnectCoroutine != null)
            {
                return;
            }

            reconnectCoroutine = StartCoroutine(ReconnectLoop());
        }

        private IEnumerator ReconnectLoop()
        {
            while (!intentionallyClosed)
            {
                yield return new WaitForSeconds(reconnectDelaySeconds);

                if (webSocket == null || webSocket.State == WebSocketState.Closed)
                {
                    Log("Attempting gateway reconnect.");
                    reconnectCoroutine = null;
                    Connect();
                    yield break;
                }
            }

            reconnectCoroutine = null;
        }

        private void Log(string message)
        {
            if (verboseLogging)
            {
                Debug.Log($"[EDM Gateway] {message}");
            }
        }
    }
}
