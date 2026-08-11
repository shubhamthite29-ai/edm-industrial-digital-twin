// WebGLSocketBridge.cs  –  EDM Digital Twin
//
// Browser-native WebSocket transport for Unity WebGL builds.
//
// The browser sandbox blocks System.Net.WebSockets.ClientWebSocket (it uses
// OS sockets which Emscripten/WebAssembly cannot access). This class wraps
// the browser''s own window.WebSocket object via Assets/Plugins/WebGL/WebSocket.jslib
// and re-exposes the same open/message/error/close event contract that
// WebSocketClient.cs uses, so the game logic layer is unchanged.
//
// Naming contract:
//   - The GameObject this component lives on MUST be named "WebGLSocketBridge"
//     because WebSocket.jslib calls:
//       SendMessage("WebGLSocketBridge", "OnJsOpen",    socketId)
//       SendMessage("WebGLSocketBridge", "OnJsMessage", socketId|json)
//       SendMessage("WebGLSocketBridge", "OnJsError",   socketId|detail)
//       SendMessage("WebGLSocketBridge", "OnJsClose",   code|reason)
//   - WebSocketClient.cs creates a child GameObject named "WebGLSocketBridge"
//     and AddComponent<WebGLSocketBridge>() on it, satisfying this contract.

#if UNITY_WEBGL && !UNITY_EDITOR
using System;
using System.Runtime.InteropServices;
using UnityEngine;

public class WebGLSocketBridge : MonoBehaviour
{
    private const string GameObjectName = "WebGLSocketBridge";

    // ── JS imports (WebSocket.jslib) ──────────────────────────────────────────
    [DllImport("__Internal")] private static extern int  DigitalTwinWSConnect (string url, string target);
    [DllImport("__Internal")] private static extern int  DigitalTwinWSSend    (int id, string msg);
    [DllImport("__Internal")] private static extern void DigitalTwinWSClose   (int id);
    [DllImport("__Internal")] private static extern int  DigitalTwinWSGetState(int id);

    // ── Events consumed by WebSocketClient ────────────────────────────────────
    public event Action          OnOpen;
    public event Action<string>  OnMessage;
    public event Action<string>  OnError;
    public event Action<int,string> OnClose;

    private int _id = -1;

    /// readyState: 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED -1=none
    public int  State  => _id >= 0 ? DigitalTwinWSGetState(_id) : -1;
    public bool IsOpen => State == 1;

    private void Awake()
    {
        // Guarantee the GameObject has the name the jslib uses for SendMessage.
        gameObject.name = GameObjectName;
    }

    // ── Public API (called by WebSocketClient) ─────────────────────────────────
    public void Connect(string url)
    {
        if (_id >= 0) { Debug.LogWarning("[Bridge] Already connected; close first."); return; }
        Log($"Connecting to {url}");
        _id = DigitalTwinWSConnect(url, GameObjectName);
        Log($"Socket ID assigned: {_id}");
    }

    public void Send(string json)
    {
        if (_id < 0) { Debug.LogWarning("[Bridge] Send called – no socket."); return; }
        DigitalTwinWSSend(_id, json);
    }

    public void Close()
    {
        if (_id < 0) return;
        DigitalTwinWSClose(_id);
    }

    // ── JS → Unity callbacks (called via SendMessage from WebSocket.jslib) ────
    // These method names MUST exactly match what WebSocket.jslib sends.

    public void OnJsOpen(string socketIdStr)
    {
        Log($"OnJsOpen: {socketIdStr}");
        if (int.TryParse(socketIdStr, out int sid)) _id = sid;
        OnOpen?.Invoke();
    }

    public void OnJsMessage(string payload)
    {
        // format: "<socketId>|<json>"
        int sep = payload.IndexOf('|');
        if (sep < 0) { Debug.LogWarning("[Bridge] Malformed message payload."); return; }
        string json = payload.Substring(sep + 1);
        OnMessage?.Invoke(json);
    }

    public void OnJsError(string payload)
    {
        int sep = payload.IndexOf('|');
        string detail = sep >= 0 ? payload.Substring(sep + 1) : payload;
        Debug.LogWarning($"[Bridge] Socket error: {detail}");
        OnError?.Invoke(detail);
    }

    public void OnJsClose(string payload)
    {
        // format: "<code>|<reason>"
        var parts  = payload.Split(new char[]{'|'}, 2);
        int code   = parts.Length > 0 && int.TryParse(parts[0], out var c) ? c : 0;
        string why = parts.Length > 1 ? parts[1] : string.Empty;
        Log($"OnJsClose: code={code} reason={why}");
        _id = -1;
        OnClose?.Invoke(code, why);
    }

    private static void Log(string msg) => Debug.Log($"[WebGLSocketBridge] {msg}");
}
#endif
