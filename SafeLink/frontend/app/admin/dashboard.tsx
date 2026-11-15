import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Colors } from '@/constants/colors';
import { api, formatApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const data = await api.admin.getDashboard();
      setStats(data);
    } catch (err: any) {
      Alert.alert('Admin Access Error', formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        if (!isAuthenticated || user?.role !== 'ADMIN') {
          Alert.alert('Restricted', 'Admin privileges required.');
          router.replace('/dashboard');
        } else {
          fetchStats();
        }
      }
    }, [authLoading, isAuthenticated, user?.role])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await api.admin.getDashboard();
      setStats(data);
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* Header Banner */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <Text style={styles.headerSub}>Real-Time Emergency Dispatch & User Telemetry</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshIconBtn}>
          <Ionicons name="refresh" size={20} color={Colors.warningAmber} />
        </TouchableOpacity>
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <Card style={styles.metricCard}>
          <Text style={styles.metricNumber}>{stats ? stats.total_users : '--'}</Text>
          <Text style={styles.metricLabel}>Total Users</Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text style={[styles.metricNumber, { color: Colors.emergencyRedBright }]}>
            {stats ? stats.active_incidents : '--'}
          </Text>
          <Text style={styles.metricLabel}>Active SOS</Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text style={[styles.metricNumber, { color: Colors.safetyGreen }]}>
            {stats ? stats.resolved_incidents : '--'}
          </Text>
          <Text style={styles.metricLabel}>Resolved</Text>
        </Card>

        <Card style={styles.metricCard}>
          <Text style={[styles.metricNumber, { color: Colors.warningAmber }]}>
            {stats ? stats.cancelled_incidents : '--'}
          </Text>
          <Text style={styles.metricLabel}>Cancelled</Text>
        </Card>
      </View>

      {/* Quick Nav Action Cards */}
      <View style={styles.navRow}>
        <Button
          title="Manage Users"
          onPress={() => router.push('/admin/users')}
          variant="secondary"
          size="md"
          style={{ flex: 1, marginRight: 6 }}
          leftIcon={<Ionicons name="people-outline" size={18} color={Colors.textPrimary} />}
        />
        <Button
          title="All Incidents"
          onPress={() => router.push('/admin/incidents')}
          variant="outline"
          size="md"
          style={{ flex: 1, marginLeft: 6, borderColor: Colors.warningAmber }}
          textStyle={{ color: Colors.warningAmber }}
          leftIcon={<Ionicons name="shield-outline" size={18} color={Colors.warningAmber} />}
        />
      </View>

      {/* Recent Alerts Feed */}
      <Card style={styles.recentFeedCard}>
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>Recent Emergency Incidents</Text>
          <TouchableOpacity onPress={() => router.push('/admin/incidents')}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.warningAmber} style={{ marginVertical: 20 }} />
        ) : !stats?.recent_incidents || stats.recent_incidents.length === 0 ? (
          <Text style={styles.emptyFeedText}>No recent emergencies recorded.</Text>
        ) : (
          stats.recent_incidents.slice(0, 5).map((inc: any) => (
            <View key={inc.id || inc.incident_id} style={styles.feedItem}>
              <View style={styles.feedItemTop}>
                <Text style={styles.feedItemUser}>{inc.user_name || 'Mohith'}</Text>
                <Badge
                  label={inc.status}
                  variant={
                    inc.status === 'ACTIVE'
                      ? 'danger'
                      : inc.status === 'RESOLVED'
                      ? 'success'
                      : 'warning'
                  }
                />
              </View>

              <Text style={styles.feedItemMsg}>{inc.status_details}</Text>

              <View style={styles.feedItemFooter}>
                <Text style={styles.feedCoords}>
                  LAT: {inc.latitude.toFixed(4)}, LNG: {inc.longitude.toFixed(4)}
                </Text>
                <Text style={styles.feedTime}>#{inc.incident_id}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  refreshIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metricCard: {
    width: '48%',
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  metricNumber: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  navRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  recentFeedCard: {
    marginBottom: 20,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  viewAllLink: {
    color: Colors.infoBlue,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyFeedText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  feedItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  feedItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feedItemUser: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  feedItemMsg: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  feedItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  feedCoords: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  feedTime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});
