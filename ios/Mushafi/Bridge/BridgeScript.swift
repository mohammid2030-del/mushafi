import Foundation

/// Injected before any page script. Exposes `window.AndroidReader` with exactly the
/// methods the iOS shell implements, so the shared web code's feature checks
/// (`window.AndroidReader?.method`) light up native features and fall back otherwise.
///
/// Value-returning methods must be synchronous (the shared code expects that), and
/// WKWebView has no synchronous bridge, so they go through `window.prompt`, which
/// blocks the page until `WKUIDelegate` answers. Fire-and-forget methods use a
/// message handler.
enum BridgeScript {
    static let syncMarker = "__MUSHAFI_BRIDGE__"
    static let handlerName = "mushafi"

    static var source: String {
        let sync = jsonArray(NativeBridge.syncMethods)
        let async = jsonArray(NativeBridge.asyncMethods)
        return """
        (function(){
          'use strict';
          if (window.AndroidReader) return;
          var SYNC = \(sync), ASYNC = \(async), MARK = '\(syncMarker)';
          function list(a){ return Array.prototype.slice.call(a); }
          function post(m, a){
            try { window.webkit.messageHandlers.\(handlerName).postMessage(JSON.stringify({m: m, a: a})); } catch (e) {}
          }
          function call(m, a){
            var r;
            try { r = window.prompt(MARK, JSON.stringify({m: m, a: a})); } catch (e) { return undefined; }
            if (r === null || r === undefined || r === '') return undefined;
            try { return JSON.parse(r).v; } catch (e) { return undefined; }
          }
          var bridge = {};
          SYNC.forEach(function(m){ bridge[m] = function(){ return call(m, list(arguments)); }; });
          ASYNC.forEach(function(m){ bridge[m] = function(){ post(m, list(arguments)); }; });
          Object.freeze(bridge);
          try {
            Object.defineProperty(window, 'AndroidReader', { value: bridge, writable: false, configurable: false });
          } catch (e) { window.AndroidReader = bridge; }
          try { Object.defineProperty(window, 'MushafiPlatform', { value: 'ios' }); } catch (e) {}
          document.documentElement && document.documentElement.classList.add('platform-ios');
        })();
        """
    }

    private static func jsonArray(_ values: [String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: values),
              let text = String(data: data, encoding: .utf8) else { return "[]" }
        return text
    }
}
