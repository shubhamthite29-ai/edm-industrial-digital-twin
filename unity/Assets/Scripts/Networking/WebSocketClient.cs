using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using EDMDigitalTwin.Machine;
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
        private readonly SemaphoreSlim sendLock = new SemaphoreSlim(1, 1);
        private ClientWebSocket webSocket;
        private CancellationTokenSource socketCancellation;
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
            ResolveSceneReferences(createMissing: true);
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
            while (mainThreadActions.TryDequeue(out Action action))
            {
                action?.Invoke();
            }
        }

        private void OnApplicationQuit()
        {
            Disconnect();
        }

        public async void Connect()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            Debug.LogWarning("ClientWebSocket is not available in Unity WebGL builds. Use this dependency-free client in Editor/Standalone; add a browser JavaScript bridge for WebGL deployment.");
            return;
#else
            if (isConnecting || IsConnected)
            {
                return;
            }

            intentionallyClosed = false;
            isConnecting = true;

            try
            {
                DisposeSocket();
                socketCancellation = new CancellationTokenSource();
                webSocket = new ClientWebSocket();

                Log($"Connecting to gateway: {gatewayUrl}");
                await webSocket.ConnectAsync(new Uri(gatewayUrl), socketCancellation.Token);

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

                _ = Task.Run(() => ReceiveLoop(socketCancellation.Token));
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Gateway connection failed: {exception.Message}");
                mainThreadActions.Enqueue(ScheduleReconnect);
            }
            finally
            {
                isConnecting = false;
            }
#endif
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

            try
            {
                socketCancellation?.Cancel();

                if (webSocket != null && (webSocket.State == WebSocketState.Open || webSocket.State == WebSocketState.CloseReceived))
                {
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Unity client disconnecting", CancellationToken.None);
                }
            }
            catch (Exception exception)
            {
                Log($"Disconnect cleanup skipped: {exception.Message}");
            }
            finally
            {
                DisposeSocket();
                ConnectionChanged?.Invoke(false);
            }
        }

        public async void Send(GatewayMessage message)
        {
            if (message == null)
            {
                return;
            }

            await SendText(GatewayMessageFactory.ToJson(message), message.type);
        }

        public async void SendRawJson(string json)
        {
            await SendText(json, "raw message");
        }

        private async Task SendText(string json, string label)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return;
            }

            if (!IsConnected)
            {
                Debug.LogWarning($"Cannot send {label} because gateway is not connected.");
                return;
            }

            await sendLock.WaitAsync();

            try
            {
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                await webSocket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, socketCancellation.Token);
                Log($"Sent: {json}");
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Failed to send {label}: {exception.Message}");
                HandleSocketClosed("send failure");
            }
            finally
            {
                sendLock.Release();
            }
        }

        private async Task ReceiveLoop(CancellationToken cancellationToken)
        {
            byte[] buffer = new byte[8192];
            var builder = new StringBuilder();

            try
            {
                while (!cancellationToken.IsCancellationRequested && webSocket != null && webSocket.State == WebSocketState.Open)
                {
                    WebSocketReceiveResult result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }

                    builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

                    if (!result.EndOfMessage)
                    {
                        continue;
                    }

                    string json = builder.ToString();
                    builder.Length = 0;
                    mainThreadActions.Enqueue(() => HandleIncomingMessage(json));
                }
            }
            catch (OperationCanceledException)
            {
                // Expected during normal disconnect.
            }
            catch (Exception exception)
            {
                mainThreadActions.Enqueue(() => Debug.LogWarning($"Gateway receive loop failed: {exception.Message}"));
            }
            finally
            {
                mainThreadActions.Enqueue(() => HandleSocketClosed("receive loop ended"));
            }
        }

        private void HandleSocketClosed(string reason)
        {
            if (heartbeatCoroutine != null)
            {
                StopCoroutine(heartbeatCoroutine);
                heartbeatCoroutine = null;
            }

            if (webSocket != null)
            {
                Log($"Gateway connection closed: {reason}.");
            }

            DisposeSocket();
            ConnectionChanged?.Invoke(false);

            if (!intentionallyClosed)
            {
                ScheduleReconnect();
            }
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
            ResolveSceneReferences(createMissing: true);

            if (machineManager == null)
            {
                Debug.LogError("MachineManager is missing and could not be created.");
            }

            return machineManager;
        }

        private MachineParameterManager GetMachineParameterManager()
        {
            ResolveSceneReferences(createMissing: true);

            if (machineParameterManager == null)
            {
                Debug.LogError("MachineParameterManager is missing and could not be created.");
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

        private void ResolveSceneReferences(bool createMissing)
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

            if (!createMissing)
            {
                return;
            }

            if (machineParameterManager == null)
            {
                machineParameterManager = gameObject.AddComponent<MachineParameterManager>();
                Debug.LogWarning("MachineParameterManager was missing and has been added to the WebSocketClient GameObject.");
            }

            if (machineManager == null)
            {
                machineManager = gameObject.AddComponent<MachineManager>();
                Debug.LogWarning("MachineManager was missing and has been added to the WebSocketClient GameObject.");
            }

            MachineTelemetryPublisher telemetryPublisher = FindFirstObjectByType<MachineTelemetryPublisher>();
            if (telemetryPublisher == null)
            {
                telemetryPublisher = gameObject.AddComponent<MachineTelemetryPublisher>();
                Debug.LogWarning("MachineTelemetryPublisher was missing and has been added to the WebSocketClient GameObject.");
            }
        }

        private IEnumerator HeartbeatLoop()
        {
            var wait = new WaitForSeconds(heartbeatIntervalSeconds);

            while (IsConnected)
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

                if (!IsConnected && !isConnecting)
                {
                    Log("Attempting gateway reconnect.");
                    reconnectCoroutine = null;
                    Connect();
                    yield break;
                }
            }

            reconnectCoroutine = null;
        }

        private void DisposeSocket()
        {
            try
            {
                socketCancellation?.Cancel();
                socketCancellation?.Dispose();
            }
            catch
            {
                // Ignore cleanup exceptions.
            }

            socketCancellation = null;

            try
            {
                webSocket?.Dispose();
            }
            catch
            {
                // Ignore cleanup exceptions.
            }

            webSocket = null;
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
