import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
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
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Analytics filters
  const [rangeDays, setRangeDays] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const fetchStats = async () => {
    if (!isAuthenticated || authLoading) return;
    setIsLoading(true);
    try {
      const [dashData, analyticsData] = await Promise.all([
        api.admin.getDashboard(),
        api.admin.getAnalytics(rangeDays, statusFilter),
      ]);
      setStats(dashData);
      setAnalytics(analyticsData);
    } catch (err: any) {
      Alert.alert('Admin Access Error', formatApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalyticsOnly = async (days: number | null, status: string) => {
    setAnalyticsLoading(true);
    try {
      const data = await api.admin.getAnalytics(days, status);
      setAnalytics(data);
    } catch (err: any) {
      console.warn('Analytics fetch error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleRangeChange = (days: number | null) => {
    setRangeDays(days);
    fetchAnalyticsOnly(days, statusFilter);
  };

  const handleStatusChange = (status: string) => {
    setStatusFilter(status);
    fetchAnalyticsOnly(rangeDays, status);
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
    try {
      const [dashData, analyticsData] = await Promise.all([
        api.admin.getDashboard(),
        api.admin.getAnalytics(rangeDays, statusFilter),
      ]);
      setStats(dashData);
      setAnalytics(analyticsData);
    } catch (e) {
      console.warn('Refresh error:', e);
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = Math.round(seconds % 60);
    return `${mins}m ${remainingSecs}s`;
  };

  return (
    <ScreenWrapper scrollable contentContainerStyle={styles.container}>
      {/* Header Banner */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <Text style={styles.headerSub}>Real-Time Emergency Dispatch & Analytics</Text>
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

      {/* 5. EMERGENCY RESPONSE ANALYTICS ENGINE */}
      <Card style={styles.analyticsCard}>
        <View style={styles.analyticsCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="analytics" size={20} color={Colors.infoBlue} />
            <Text style={styles.analyticsCardTitle}>EMERGENCY RESPONSE ANALYTICS</Text>
          </View>
          {analyticsLoading && <ActivityIndicator size="small" color={Colors.infoBlue} />}
        </View>

        {/* Time Range Filter Chips */}
        <Text style={styles.filterSectionLabel}>TIME RANGE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
          {[
            { label: 'All Time', value: null },
            { label: '24 Hours', value: 1 },
            { label: '7 Days', value: 7 },
            { label: '30 Days', value: 30 },
          ].map((chip) => {
            const isSelected = rangeDays === chip.value;
            return (
              <TouchableOpacity
                key={chip.label}
                onPress={() => handleRangeChange(chip.value)}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Status Filter Chips */}
        <Text style={styles.filterSectionLabel}>INCIDENT STATUS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
          {[
            { label: 'All Incidents', value: 'ALL' },
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Resolved', value: 'RESOLVED' },
            { label: 'Cancelled', value: 'CANCELLED' },
          ].map((chip) => {
            const isSelected = statusFilter === chip.value;
            return (
              <TouchableOpacity
                key={chip.label}
                onPress={() => handleStatusChange(chip.value)}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Analytics Content */}
        {analyticsLoading && !analytics ? (
          <ActivityIndicator size="small" color={Colors.infoBlue} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.analyticsBody}>
            {/* Average Times Section */}
            <View style={styles.avgTimesRow}>
              <View style={styles.avgTimeBox}>
                <Ionicons name="timer-outline" size={18} color={Colors.warningAmber} />
                <Text style={styles.avgTimeValue}>
                  {formatDuration(analytics?.avg_acknowledgement_time_seconds)}
                </Text>
                <Text style={styles.avgTimeLabel}>Avg Ack Time</Text>
                <Text style={styles.avgTimeSub}>Until Contact Responds</Text>
              </View>

              <View style={styles.avgTimeBox}>
                <Ionicons name="checkmark-done-circle-outline" size={18} color={Colors.safetyGreen} />
                <Text style={[styles.avgTimeValue, { color: Colors.safetyGreen }]}>
                  {formatDuration(analytics?.avg_resolution_time_seconds)}
                </Text>
                <Text style={styles.avgTimeLabel}>Avg Resolution</Text>
                <Text style={styles.avgTimeSub}>Activation to Closed</Text>
              </View>
            </View>

            {/* Escalation Level Breakdown */}
            <View style={styles.sectionDivider} />
            <Text style={styles.subSectionTitle}>ESCALATION LADDER DISTRIBUTION</Text>
            <View style={styles.ladderRow}>
              <View style={styles.ladderItem}>
                <Text style={styles.ladderCount}>
                  {analytics?.escalation_stats?.level_1_acknowledged ?? '--'}
                </Text>
                <Text style={styles.ladderLabel}>L1 Direct</Text>
              </View>
              <View style={styles.ladderItem}>
                <Text style={[styles.ladderCount, { color: Colors.warningAmber }]}>
                  {analytics?.escalation_stats?.level_2_escalated ?? '--'}
                </Text>
                <Text style={styles.ladderLabel}>L2 Backup</Text>
              </View>
              <View style={styles.ladderItem}>
                <Text style={[styles.ladderCount, { color: Colors.emergencyRedBright }]}>
                  {analytics?.escalation_stats?.level_3_escalated ?? '--'}
                </Text>
                <Text style={styles.ladderLabel}>L3 Emergency</Text>
              </View>
              <View style={styles.ladderItem}>
                <Text style={[styles.ladderCount, { color: Colors.textMuted }]}>
                  {analytics?.escalation_stats?.ladder_exhausted ?? 0}
                </Text>
                <Text style={styles.ladderLabel}>Exhausted</Text>
              </View>
            </View>

            {/* Notification Delivery Performance */}
            <View style={styles.sectionDivider} />
            <Text style={styles.subSectionTitle}>NOTIFICATION ATTEMPTS & DELIVERY</Text>
            <View style={styles.deliveryRow}>
              <View style={styles.deliveryStat}>
                <Text style={styles.deliveryStatValue}>
                  {analytics?.total_notification_attempts ?? '--'}
                </Text>
                <Text style={styles.deliveryStatLabel}>Total Dispatches</Text>
              </View>
              <View style={styles.deliveryStat}>
                <Text style={[styles.deliveryStatValue, { color: Colors.safetyGreen }]}>
                  {analytics?.successful_notifications ?? '--'}
                </Text>
                <Text style={styles.deliveryStatLabel}>Delivered / Acked</Text>
              </View>
              <View style={styles.deliveryStat}>
                <Text style={[styles.deliveryStatValue, { color: Colors.emergencyRedBright }]}>
                  {analytics?.failed_notifications ?? 0}
                </Text>
                <Text style={styles.deliveryStatLabel}>Failed Retried</Text>
              </View>
            </View>

            {/* Offline Intelligence & Telemetry Recovery */}
            <View style={styles.sectionDivider} />
            <Text style={styles.subSectionTitle}>OFFLINE INTEL & TELEMETRY RECOVERY</Text>
            <View style={styles.offlineStatsRow}>
              <View style={styles.offlineBox}>
                <Text style={styles.offlineBoxNum}>{analytics?.direct_online_incidents ?? '--'}</Text>
                <Text style={styles.offlineBoxLabel}>Direct Online</Text>
              </View>
              <View style={styles.offlineBox}>
                <Text style={[styles.offlineBoxNum, { color: Colors.warningAmber }]}>
                  {analytics?.offline_created_incidents ?? '--'}
                </Text>
                <Text style={styles.offlineBoxLabel}>Offline Queued</Text>
              </View>
              <View style={styles.offlineBox}>
                <Text style={[styles.offlineBoxNum, { color: Colors.safetyGreen }]}>
                  {analytics?.offline_sync_recovery_rate ?? 100}%
                </Text>
                <Text style={styles.offlineBoxLabel}>Sync Restored</Text>
              </View>
            </View>
          </View>
        )}
      </Card>

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
                  LAT: {typeof inc.latitude === 'number' ? inc.latitude.toFixed(4) : inc.latitude}, LNG: {typeof inc.longitude === 'number' ? inc.longitude.toFixed(4) : inc.longitude}
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

  /* Analytics Card */
  analyticsCard: {
    backgroundColor: '#0F1C3F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  analyticsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  analyticsCardTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  filterSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 6,
  },
  filterChipScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#60A5FA',
    fontWeight: '800',
  },
  analyticsBody: {
    marginTop: 8,
  },
  avgTimesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  avgTimeBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  avgTimeValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.warningAmber,
    marginTop: 4,
  },
  avgTimeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  avgTimeSub: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 14,
  },
  subSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  ladderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ladderItem: {
    flex: 1,
    alignItems: 'center',
  },
  ladderCount: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  ladderLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  deliveryStat: {
    flex: 1,
    alignItems: 'center',
  },
  deliveryStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  deliveryStatLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  offlineStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  offlineBox: {
    flex: 1,
    alignItems: 'center',
  },
  offlineBoxNum: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  offlineBoxLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },

  /* Recent Feed */
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
