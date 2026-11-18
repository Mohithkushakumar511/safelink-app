import React, { useMemo } from 'react';
import { StyleSheet, View, Platform, StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/colors';

interface MapViewProps {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  markerTitle?: string;
  zoom?: number;
  style?: StyleProp<ViewStyle>;
  isEmergency?: boolean;
}

export const SafeLinkMapView: React.FC<MapViewProps> = ({
  latitude,
  longitude,
  accuracy,
  markerTitle = 'Current Location',
  zoom = 15,
  style,
  isEmergency = false,
}) => {
  const mapHtml = useMemo(() => {
    const markerColor = isEmergency ? Colors.emergencyRed : Colors.infoBlue;
    const pulseHtml = isEmergency
      ? `<div style="position: absolute; top: -14px; left: -14px; width: 44px; height: 44px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: pulse 1.5s infinite;"></div>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
            html, body, #map {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background-color: #0A1128;
            }
            .custom-marker {
              position: relative;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background-color: ${markerColor};
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 10px rgba(0,0,0,0.5);
            }
            @keyframes pulse {
              0% { transform: scale(0.8); opacity: 0.9; }
              70% { transform: scale(1.6); opacity: 0.0; }
              100% { transform: scale(0.8); opacity: 0.0; }
            }
            .leaflet-popup-content-wrapper {
              background: #101F42;
              color: #FFFFFF;
              border: 1px solid #1E356D;
              border-radius: 8px;
            }
            .leaflet-popup-tip {
              background: #101F42;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script>
            var map = L.map('map', {
              center: [${latitude}, ${longitude}],
              zoom: ${zoom},
              zoomControl: true,
              attributionControl: false
            });

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              maxZoom: 19,
              subdomains: 'abcd'
            }).addTo(map);

            var customIcon = L.divIcon({
              className: 'marker-container',
              html: '${pulseHtml}<div class="custom-marker"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            });

            var marker = L.marker([${latitude}, ${longitude}], { icon: customIcon }).addTo(map);
            marker.bindPopup("<b>${markerTitle}</b><br/>Lat: ${latitude.toFixed(5)}<br/>Lng: ${longitude.toFixed(5)}").openPopup();

            ${accuracy ? `L.circle([${latitude}, ${longitude}], { radius: ${accuracy}, color: '${markerColor}', fillOpacity: 0.15, weight: 1 }).addTo(map);` : ''}
          </script>
        </body>
      </html>
    `;
  }, [latitude, longitude, accuracy, markerTitle, zoom, isEmergency]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <iframe
          srcDoc={mapHtml}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 16 }}
          title="SafeLink Map"
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: mapHtml }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 220,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardBackground,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
