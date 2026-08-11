// Assets/Plugins/WebGL/WebSocket.jslib
//
// Browser-native WebSocket transport for Unity WebGL builds.
//
// Exposes four C-callable functions to C# via DllImport("__Internal"):
//   DigitalTwinWSConnect   – open a WebSocket and return an integer socket ID
//   DigitalTwinWSSend      – send a text frame on an open socket
//   DigitalTwinWSClose     – close the socket gracefully
//   DigitalTwinWSGetState  – return the browser readyState (0-3) or -1
//
// Each socket''s JS events are forwarded back into Unity via:
//   SendMessage("<targetGameObject>", "OnJsOpen",    "<socketId>")
//   SendMessage("<targetGameObject>", "OnJsMessage", "<socketId>|<jsonText>")
//   SendMessage("<targetGameObject>", "OnJsError",   "<socketId>|<detail>")
//   SendMessage("<targetGameObject>", "OnJsClose",   "<code>|<reason>")
//
// The target game object name is supplied by C# when Connect() is called
// and must match the GameObject that has WebGLSocketBridge attached.

mergeInto(LibraryManager.library, {

  // ── DigitalTwinWSConnect ─────────────────────────────────────────────────
  DigitalTwinWSConnect: function(urlPtr, targetPtr) {
    if (!Module.__dtWs) {
      Module.__dtWs = {};
      Module.__dtWsNextId = 1;
    }

    var url    = UTF8ToString(urlPtr);
    var target = UTF8ToString(targetPtr);
    var id     = Module.__dtWsNextId++;

    console.log("[WebSocket.jslib] Connecting id=" + id + " url=" + url + " target=" + target);

    try {
      var socket = new WebSocket(url);

      socket.onopen = function() {
        console.log("[WebSocket.jslib] onopen id=" + id);
        SendMessage(target, "OnJsOpen", String(id));
      };

      socket.onmessage = function(evt) {
        if (typeof evt.data === "string") {
          SendMessage(target, "OnJsMessage", id + "|" + evt.data);
        }
        // Binary frames are not used by the EDM Gateway protocol.
      };

      socket.onerror = function() {
        console.warn("[WebSocket.jslib] onerror id=" + id);
        SendMessage(target, "OnJsError", id + "|WebSocket connection error");
      };

      socket.onclose = function(evt) {
        console.log("[WebSocket.jslib] onclose id=" + id + " code=" + evt.code);
        SendMessage(target, "OnJsClose", String(evt.code || 0) + "|" + (evt.reason || ""));
        if (Module.__dtWs) delete Module.__dtWs[id];
      };

      Module.__dtWs[id] = socket;
    } catch(err) {
      console.error("[WebSocket.jslib] Exception: " + err.message);
      SendMessage(target, "OnJsError", id + "|" + err.message);
    }

    return id;
  },

  // ── DigitalTwinWSSend ────────────────────────────────────────────────────
  DigitalTwinWSSend: function(id, msgPtr) {
    var msg    = UTF8ToString(msgPtr);
    var socket = Module.__dtWs && Module.__dtWs[id];
    if (socket && socket.readyState === 1 /* OPEN */) {
      socket.send(msg);
      return 1;
    }
    console.warn("[WebSocket.jslib] Send ignored – socket " + id + " not open");
    return 0;
  },

  // ── DigitalTwinWSClose ───────────────────────────────────────────────────
  DigitalTwinWSClose: function(id) {
    var socket = Module.__dtWs && Module.__dtWs[id];
    if (socket) {
      try { socket.close(1000, "Client closing"); } catch(e) { /* already closed */ }
    }
  },

  // ── DigitalTwinWSGetState ────────────────────────────────────────────────
  DigitalTwinWSGetState: function(id) {
    var socket = Module.__dtWs && Module.__dtWs[id];
    return socket ? socket.readyState : -1;
  }

});
