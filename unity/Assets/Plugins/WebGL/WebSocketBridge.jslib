// WebSocketBridge.jslib
// Provides browser-native WebSocket access to Unity WebGL C# code.
// Unity compiles this file into the WebGL build automatically because it
// lives in Assets/Plugins/WebGL/.
//
// C# side calls these functions via [DllImport("__Internal")] externs.
// The JS side calls back into Unity via SendMessage().

mergeInto(LibraryManager.library, {

  // ---------------------------------------------------------------------------
  // WSB_Connect
  // Opens a WebSocket to the given URL and registers all event callbacks.
  // gameObjectName  – name of the Unity GameObject holding WebSocketClient
  // url             – ws:// or wss:// gateway URL
  // ---------------------------------------------------------------------------
  WSB_Connect: function (gameObjectNamePtr, urlPtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    var url            = UTF8ToString(urlPtr);

    // Clean up any previous socket.
    if (typeof window._edmWS !== "undefined" && window._edmWS !== null) {
      try { window._edmWS.close(); } catch(e) {}
      window._edmWS = null;
    }

    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      SendMessage(gameObjectName, "OnWebGLError", "WebSocket constructor threw: " + e.message);
      return;
    }

    window._edmWS = ws;
    window._edmWSGameObject = gameObjectName;

    ws.onopen = function () {
      SendMessage(gameObjectName, "OnWebGLOpen", "");
    };

    ws.onmessage = function (evt) {
      SendMessage(gameObjectName, "OnWebGLMessage", evt.data);
    };

    ws.onerror = function (evt) {
      SendMessage(gameObjectName, "OnWebGLError", "WebSocket error");
    };

    ws.onclose = function (evt) {
      SendMessage(gameObjectName, "OnWebGLClose", evt.code + ":" + evt.reason);
      window._edmWS = null;
    };
  },

  // ---------------------------------------------------------------------------
  // WSB_Send
  // Sends a UTF-8 text frame if the socket is currently OPEN.
  // Returns 1 on success, 0 on failure.
  // ---------------------------------------------------------------------------
  WSB_Send: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    if (typeof window._edmWS === "undefined" || window._edmWS === null) return 0;
    if (window._edmWS.readyState !== WebSocket.OPEN) return 0;
    try {
      window._edmWS.send(json);
      return 1;
    } catch (e) {
      return 0;
    }
  },

  // ---------------------------------------------------------------------------
  // WSB_Close
  // Gracefully closes the socket.
  // ---------------------------------------------------------------------------
  WSB_Close: function () {
    if (typeof window._edmWS === "undefined" || window._edmWS === null) return;
    try {
      if (window._edmWS.readyState === WebSocket.OPEN || window._edmWS.readyState === WebSocket.CONNECTING) {
        window._edmWS.close(1000, "Unity client disconnecting");
      }
    } catch (e) {}
    window._edmWS = null;
  },

  // ---------------------------------------------------------------------------
  // WSB_GetState
  // Returns the current readyState integer (0=CONNECTING,1=OPEN,2=CLOSING,3=CLOSED).
  // Returns 3 (CLOSED) if no socket exists.
  // ---------------------------------------------------------------------------
  WSB_GetState: function () {
    if (typeof window._edmWS === "undefined" || window._edmWS === null) return 3;
    return window._edmWS.readyState;
  }

});
