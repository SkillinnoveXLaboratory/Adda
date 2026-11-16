import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';

/**
 * Leaflet + OpenStreetMap tiles in a WebView, with a draggable pin. Tapping the map moves the pin.
 * Pin moves are posted back as {lat,lng}; a new `value` from search / GPS is pushed in with injectJavaScript.
 */
const html = (start) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:${colors.bg}}.leaflet-control-attribution{font-size:10px}</style></head>
<body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  function send(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  if (!window.L) { send({ type: 'error' }); return; }
  var start = ${JSON.stringify(start)};
  var map = L.map('m', { zoomControl: true }).setView(start ? [start.lat, start.lng] : [22.5, 79], start ? 15 : 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  map.attributionControl.setPrefix(false);
  var pin = null;
  function place(lat, lng, pan){
    if (!pin) {
      pin = L.marker([lat, lng], { draggable: true }).addTo(map);
      pin.on('dragend', function(){ var p = pin.getLatLng(); send({ type: 'pin', lat: p.lat, lng: p.lng }); });
    } else pin.setLatLng([lat, lng]);
    if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }
  if (start) place(start.lat, start.lng, false);
  map.on('click', function(e){ place(e.latlng.lat, e.latlng.lng, false); send({ type: 'pin', lat: e.latlng.lat, lng: e.latlng.lng }); });
  window.setPin = function(lat, lng){ place(lat, lng, true); };
  window.clearPin = function(){ if (pin) { map.removeLayer(pin); pin = null; } };
  send({ type: 'ready' });
})();
</script></body></html>`;

export function LocationMap({ value, onPick, height = 210 }) {
  const ref = useRef(null);
  const last = useRef(value ? `${value.lat},${value.lng}` : '');
  // The page is built once (with the first value); later changes are pushed in without reloading the tiles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ html: html(value ? { lat: value.lat, lng: value.lng } : null), baseUrl: 'https://adda.skillinnovex.in/' }), []);

  useEffect(() => {
    const key = value ? `${value.lat},${value.lng}` : '';
    if (key === last.current) return;
    last.current = key;
    ref.current?.injectJavaScript(value ? `window.setPin && window.setPin(${Number(value.lat)}, ${Number(value.lng)}); true;` : 'window.clearPin && window.clearPin(); true;');
  }, [value]);

  const onMessage = (e) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'pin' && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
        last.current = `${m.lat},${m.lng}`;
        onPick?.({ lat: m.lat, lng: m.lng });
      }
    } catch {
      // ignore anything that is not ours
    }
  };

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Map. Tap or drag the pin to set the exact spot.">
      <WebView
        ref={ref}
        source={source}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        style={{ backgroundColor: colors.bg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
});
