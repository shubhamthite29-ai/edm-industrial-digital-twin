// WebSocketClient.cs  –  EDM Digital Twin
//
// Dual-backend WebSocket relay:
//   Standalone / Editor  →  System.Net.WebSockets.ClientWebSocket
//   WebGL build          →  WebGLSocketBridge + WebSocket.jslib (browser-native)
//
// Root cause of the original bug:
//   The WebGL branch previously contained ONLY a Debug.LogWarning + return,
//   so the WebGL build never connected to the gateway. This file wires the
//   existing WebGLSocketBridge component into the same logic used by the
//   Standalone path so both behave identically.

using System;
using System.Collections;
using System.Text;
using EDMDigitalTwin.Machine;
using UnityEngine;

#if UNITY_WEBGL && !UNITY_EDITOR
// No additional usings required for WebGL path – uses WebGLSocketBridge only.
#else
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
#endif

namespace EDMDigitalTwin.Networking
{
    [AddComponentMenu("EDM/WebSocket Client")]
    public class WebSocketClient : MonoBehaviour
    {
        // ── Inspector ──────────────────────────────────────────────────────────
        [Header("Gateway")]
        [Tooltip("ws:// URL of the Node.js gateway. Default: ws://localhost:8080")]
        [SerializeField] private string gatewayUrl = "ws://localhost:8080";
        [SerializeField] private bool connectOnStart = true;

        [Header("Scene References")]
        [SerializeField] private MachineManager machineManager;
        [SerializeField] private MachineParameterManager machineParameterManager;
        [SerializeField] private CameraManager cameraManager;

        [Header("Timing")]
        [SerializeField] private float reconnectDelaySec = 2f;
        [SerializeField] private float heartbeatIntervalSec = 10f;
        [SerializeField] private bool verboseLog = true;

        // ── Public ─────────────────────────────────────────────────────────────
        public event Action<bool> ConnectionChanged;
        public string GatewayUrl { get => gatewayUrl; set => gatewayUrl = value; }

        // ── WebGL ──────────────────────────────────────────────────────────────
#if UNITY_WEBGL && !UNITY_EDITOR
        private WebGLSocketBridge _bridge;
#endif

        // ── Standalone / Editor ────────────────────────────────────────────────
#if !UNITY_WEBGL || UNITY_EDITOR
        private readonly ConcurrentQueue<Action> _mainQ = new ConcurrentQueue<Action>();
        private readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);
        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
#endif

        // ── Shared ─────────────────────────────────────────────────────────────
        private Coroutine _reconnectCo;
        private Coroutine _heartbeatCo;
        private bool _closed;          // intentionally closed
        private bool _connecting;

        // ── IsConnected ────────────────────────────────────────────────────────
        public bool IsConnected
        {
            get
            {
#if UNITY_WEBGL && !UNITY_EDITOR
                return _bridge != null && _bridge.IsOpen;
#else
                return _ws != null && _ws.State == WebSocketState.Open;
#endif
            }
        }

        // ── Lifecycle ──────────────────────────────────────────────────────────
        private void Awake()
        {
            AutoResolveRefs();

#if UNITY_WEBGL && !UNITY_EDITOR
            // Create a dedicated child GameObject for the bridge so that JS
            // SendMessage("WebGLSocketBridge", ...) finds it by name.
            _bridge = GetComponentInChildren<WebGLSocketBridge>();
            if (_bridge == null)
            {
                var go = new GameObject("WebGLSocketBridge");
                go.transform.SetParent(transform, false);
                _bridge = go.AddComponent<WebGLSocketBridge>();
            }
            _bridge.OnOpen    += OnBridgeOpen;
            _bridge.OnMessage += OnBridgeMessage;
            _bridge.OnError   += OnBridgeError;
            _bridge.OnClose   += OnBridgeClose;
#endif
        }

        private void Start()
        {
            if (connectOnStart) Connect();
        }

        private void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            while (_mainQ.TryDequeue(out var a)) a?.Invoke();
#endif
        }

        private void OnApplicationQuit() => Disconnect();

        // ── Connect / Disconnect ───────────────────────────────────────────────
        public void Connect()
        {
            if (_connecting || IsConnected) return;
            _closed = false;
            _connecting = true;
            Log($"Connecting to {gatewayUrl}");

#if UNITY_WEBGL && !UNITY_EDITOR
            _bridge.Connect(gatewayUrl);
            _connecting = false;   // JS is event-driven; we'll hear back via OnBridgeOpen
#else
            ConnectAsync();
#endif
        }

        public void Disconnect()
        {
            _closed = true;
            StopHeartbeat();
            StopReconnect();
#if UNITY_WEBGL && !UNITY_EDITOR
            _bridge?.Close();
            ConnectionChanged?.Invoke(false);
#else
            DisconnectAsync();
#endif
        }

        // ── Send ───────────────────────────────────────────────────────────────
        public void Send(GatewayMessage msg)
        {
            if (msg == null) return;
            SendRawJson(GatewayMessageFactory.ToJson(msg));
        }

        public void SendRawJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return;
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!IsConnected) { Debug.LogWarning("[EDM WS] Cannot send – not connected."); return; }
            _bridge.Send(json);
            Log($"TX: {json}");
#else
            SendAsync(json);
#endif
        }

        // ── WebGL Bridge Callbacks ─────────────────────────────────────────────
#if UNITY_WEBGL && !UNITY_EDITOR
        private void OnBridgeOpen()
        {
            _connecting = false;
            Log("Connected to gateway (WebGL).");
            ConnectionChanged?.Invoke(true);
            Send(GatewayMessageFactory.ClientHello());
            StartHeartbeat();
        }

        private void OnBridgeMessage(string json)
        {
            Log($"RX: {json}");
            HandleMessage(json);
        }

        private void OnBridgeError(string detail)
        {
            Debug.LogWarning($"[EDM WS] Bridge error: {detail}");
            _connecting = false;
            HandleClosed("bridge error");
        }

        private void OnBridgeClose(int code, string reason)
        {
            Log($"Bridge closed {code} {reason}");
            _connecting = false;
            HandleClosed($"code {code}");
        }
#endif

        // ── Standalone Async Helpers ───────────────────────────────────────────
#if !UNITY_WEBGL || UNITY_EDITOR
        private async void ConnectAsync()
        {
            try
            {
                DisposeSocket();
                _cts = new CancellationTokenSource();
                _ws  = new ClientWebSocket();
                await _ws.ConnectAsync(new Uri(gatewayUrl), _cts.Token);
                _mainQ.Enqueue(() =>
                {
                    Log("Connected to gateway (Standalone).");
                    ConnectionChanged?.Invoke(true);
                    Send(GatewayMessageFactory.ClientHello());
                    StartHeartbeat();
                });
                _ = Task.Run(() => ReceiveLoop(_cts.Token));
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[EDM WS] Connect failed: {ex.Message}");
                _mainQ.Enqueue(ScheduleReconnect);
            }
            finally { _connecting = false; }
        }

        private async void DisconnectAsync()
        {
            try
            {
                _cts?.Cancel();
                if (_ws != null && (_ws.State == WebSocketState.Open || _ws.State == WebSocketState.CloseReceived))
                    await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "closing", CancellationToken.None);
            }
            catch { }
            finally { DisposeSocket(); ConnectionChanged?.Invoke(false); }
        }

        private async void SendAsync(string json)
        {
            if (!IsConnected) { Debug.LogWarning("[EDM WS] Cannot send – not connected."); return; }
            await _sendLock.WaitAsync();
            try
            {
                var bytes = Encoding.UTF8.GetBytes(json);
                await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
                Log($"TX: {json}");
            }
            catch (Exception ex) { Debug.LogWarning($"[EDM WS] Send failed: {ex.Message}"); HandleClosed("send error"); }
            finally { _sendLock.Release(); }
        }

        private async Task ReceiveLoop(CancellationToken ct)
        {
            var buf = new byte[8192];
            var sb  = new StringBuilder();
            try
            {
                while (!ct.IsCancellationRequested && _ws?.State == WebSocketState.Open)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    sb.Append(Encoding.UTF8.GetString(buf, 0, result.Count));
                    if (!result.EndOfMessage) continue;
                    var json = sb.ToString();
                    sb.Length = 0;
                    _mainQ.Enqueue(() => HandleMessage(json));
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { _mainQ.Enqueue(() => Debug.LogWarning($"[EDM WS] Receive error: {ex.Message}")); }
            finally { _mainQ.Enqueue(() => HandleClosed("receive loop ended")); }
        }

        private void DisposeSocket()
        {
            try { _cts?.Cancel(); _cts?.Dispose(); } catch { }
            _cts = null;
            try { _ws?.Dispose(); } catch { }
            _ws = null;
        }
#endif

        // ── Shared message / connection handlers ───────────────────────────────
        private void HandleClosed(string reason)
        {
            StopHeartbeat();
            Log($"Gateway closed: {reason}");
            ConnectionChanged?.Invoke(false);
            if (!_closed) ScheduleReconnect();
        }

        private void HandleMessage(string json)
        {
            Log($"RX: {json}");
            if (!GatewayMessageFactory.TryFromJson(json, out var msg)) return;

            switch (msg.type)
            {
                case GatewayMessageTypes.MachineCommand:
                    HandleMachineCommand(msg);
                    break;

                case GatewayMessageTypes.MachineParametersPatch:
                    AutoResolveRefs();
                    machineParameterManager?.ApplyPatchJson(json);
                    break;

                case GatewayMessageTypes.CameraCommand:
                    AutoResolveRefs();
                    if (msg.payload?.view != null)
                        cameraManager?.SetView(msg.payload.view);
                    break;

                case GatewayMessageTypes.Ack:
                case GatewayMessageTypes.Heartbeat:
                    break;   // expected, silently ignored

                case GatewayMessageTypes.Error:
                    Debug.LogWarning($"[EDM WS] Gateway error: {msg.payload?.code} {msg.payload?.detail}");
                    break;
            }
        }

        private void HandleMachineCommand(GatewayMessage msg)
        {
            AutoResolveRefs();
            var cmd = msg.payload?.command?.ToLowerInvariant() ?? string.Empty;
            Log($"Machine command: {cmd}");
            switch (cmd)
            {
                case "start":           machineManager?.StartMachining();    break;
                case "stop":            machineManager?.StopMachining();     break;
                case "pause":           machineManager?.PauseMachining();    break;
                case "resume":          machineManager?.ResumeMachining();   break;
                case "reset":           machineManager?.ResetMachine();      break;
                case "home":            machineManager?.HomeMachine();       break;
                case "emergency_stop":  machineManager?.EmergencyStop();     break;
                case "request_status":  machineManager?.PublishCurrentState(); break;
                default: Debug.LogWarning($"[EDM WS] Unknown command: {cmd}"); break;
            }
        }

        // ── Heartbeat ──────────────────────────────────────────────────────────
        private void StartHeartbeat()
        {
            StopHeartbeat();
            _heartbeatCo = StartCoroutine(HeartbeatCo());
        }
        private void StopHeartbeat()
        {
            if (_heartbeatCo != null) { StopCoroutine(_heartbeatCo); _heartbeatCo = null; }
        }
        private IEnumerator HeartbeatCo()
        {
            var wait = new WaitForSeconds(heartbeatIntervalSec);
            while (IsConnected) { Send(GatewayMessageFactory.Heartbeat()); yield return wait; }
        }

        // ── Reconnect ──────────────────────────────────────────────────────────
        private void ScheduleReconnect()
        {
            if (_closed || _reconnectCo != null) return;
            _reconnectCo = StartCoroutine(ReconnectCo());
        }
        private void StopReconnect()
        {
            if (_reconnectCo != null) { StopCoroutine(_reconnectCo); _reconnectCo = null; }
        }
        private IEnumerator ReconnectCo()
        {
            yield return new WaitForSeconds(reconnectDelaySec);
            _reconnectCo = null;
            if (!_closed && !IsConnected && !_connecting) Connect();
        }

        // ── Auto-resolve scene references ──────────────────────────────────────
        private void AutoResolveRefs()
        {
            if (machineManager       == null) machineManager       = FindFirstObjectByType<MachineManager>();
            if (machineParameterManager == null) machineParameterManager = FindFirstObjectByType<MachineParameterManager>();
            if (cameraManager        == null) cameraManager        = FindFirstObjectByType<CameraManager>();

            // If MachineManager still missing, create one on this GameObject.
            if (machineManager == null)
            {
                machineManager = gameObject.AddComponent<MachineManager>();
                Debug.LogWarning("[EDM WS] MachineManager was missing – added to WebSocketClient GameObject.");
            }
            if (machineParameterManager == null)
            {
                machineParameterManager = gameObject.AddComponent<MachineParameterManager>();
                Debug.LogWarning("[EDM WS] MachineParameterManager was missing – added to WebSocketClient GameObject.");
            }
        }

        // ── Logging ────────────────────────────────────────────────────────────
        private void Log(string msg)
        {
            if (verboseLog) Debug.Log($"[EDM WS] {msg}");
        }
    }
}
